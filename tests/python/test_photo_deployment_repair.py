"""Synthetic deployment tests; never read real training or held-out images."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import photo_model_deployment_repair as repair


class DeploymentRepairTests(unittest.TestCase):
    def test_float16_storage_retains_float32_interface_and_exact_head(self):
        rng = np.random.default_rng(17)
        backbone = rng.normal(0, .03, (32, 512)).astype(np.float32)
        head = rng.normal(0, .03, (512, 3)).astype(np.float32)
        original = helper.make_model(helper.make_graph([
            helper.make_node("MatMul", ["image", "backbone"], ["features"]),
            helper.make_node("MatMul", ["features", "head"], ["logits"]),
        ], "synthetic", [helper.make_tensor_value_info("image", TensorProto.FLOAT, [1, 32])],
            [helper.make_tensor_value_info("logits", TensorProto.FLOAT, [1, 3])],
            [numpy_helper.from_array(backbone, "backbone"), numpy_helper.from_array(head, "head")]),
            opset_imports=[helper.make_opsetid("", 17)])
        original.ir_version = 10
        with tempfile.TemporaryDirectory() as temporary:
            source, target = Path(temporary) / "source.onnx", Path(temporary) / "target.onnx"
            onnx.save(original, source)
            details = repair.float16_storage(source, target, [head])
            converted = onnx.load(target)
            initializers = {item.name: item for item in converted.graph.initializer}
            self.assertEqual(details["converted_initializer_count"], 1)
            self.assertEqual(details["protected_head_initializers"], ["head"])
            self.assertEqual(initializers["backbone__fp16_storage"].data_type, TensorProto.FLOAT16)
            self.assertEqual(initializers["head"].data_type, TensorProto.FLOAT)
            np.testing.assert_array_equal(numpy_helper.to_array(initializers["head"]), head)
            self.assertEqual(converted.graph.node[0].op_type, "Cast")
            self.assertEqual(converted.graph.input[0].type.tensor_type.elem_type, TensorProto.FLOAT)
            x = rng.normal(size=(1, 32)).astype(np.float32)
            before = repair.session(source).run(["logits"], {"image": x})[0]
            after = repair.session(target).run(["logits"], {"image": x})[0]
            self.assertTrue(repair.parity_report(before, after)["passed"])
            self.assertLess(target.stat().st_size, source.stat().st_size)

    def test_unrepresentable_initializer_is_not_overflowed(self):
        values = np.full((32, 32), 1e10, dtype=np.float32)
        model = helper.make_model(helper.make_graph([helper.make_node("MatMul", ["x", "w"], ["y"])], "large",
            [helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, 32])],
            [helper.make_tensor_value_info("y", TensorProto.FLOAT, [1, 32])], [numpy_helper.from_array(values, "w")]), opset_imports=[helper.make_opsetid("", 17)])
        with tempfile.TemporaryDirectory() as temporary:
            source, target = Path(temporary) / "source.onnx", Path(temporary) / "target.onnx"
            onnx.save(model, source)
            result = repair.float16_storage(source, target)
            self.assertEqual(result["converted_initializer_count"], 0)
            np.testing.assert_array_equal(numpy_helper.to_array(onnx.load(target).graph.initializer[0]), values)

    def test_parts_reassemble_byte_identically_with_local_hashes(self):
        data = bytes(range(255)) * 7
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "model.onnx"
            source.write_bytes(data)
            parts = repair.split_artifact(source, root / "public", 100)
            actual = b"".join((root / "public" / Path(p["url"]).name).read_bytes() for p in parts["parts"])
            self.assertEqual(data, actual)
            self.assertEqual(parts["sha256"], hashlib.sha256(data).hexdigest())
            self.assertEqual(parts["bytes"], len(data))
            for part in parts["parts"]:
                self.assertLessEqual(part["bytes"], 100)
                self.assertEqual(hashlib.sha256((root / "public" / Path(part["url"]).name).read_bytes()).hexdigest(), part["sha256"])
            self.assertEqual(repair.split_artifact(source, root / "public", 100), parts)

    def test_parts_refuse_existing_mutation(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "model.onnx"
            source.write_bytes(b"synthetic")
            public = Path(temporary) / "public"
            repair.split_artifact(source, public, 100)
            (public / "model.part-1.bin").write_bytes(b"changed")
            with self.assertRaisesRegex(RuntimeError, "differs"):
                repair.split_artifact(source, public, 100)

    def test_part_size_is_bounded(self):
        for size in [0, -1, repair.MAX_PART_BYTES + 1]:
            with self.assertRaises(ValueError):
                repair.split_artifact("unused", "unused", size)

    def test_parity_requires_close_logits_and_identical_top_class(self):
        self.assertTrue(repair.parity_report([[1., 2., 3.]], [[1.001, 2., 3.]])["passed"])
        self.assertFalse(repair.parity_report([[1., 2., 3.]], [[1.1, 2., 3.]])["passed"])
        self.assertFalse(repair.parity_report([[1., 1.001, 0.]], [[1.002, 1., 0.]])["passed"])

    def test_parity_rejects_nonfinite_and_wrong_shape(self):
        for candidate in [[[np.nan, 2., 3.]], [[np.inf, 2., 3.]], [[1., 2.]], [1., 2., 3.]]:
            with self.assertRaises(ValueError):
                repair.parity_report([[1., 2., 3.]], candidate)

    def test_registration_is_immutable(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "protocol.json"
            repair.immutable_json(path, {"fixed": 1})
            repair.immutable_json(path, {"fixed": 1})
            with self.assertRaisesRegex(RuntimeError, "Immutable"):
                repair.immutable_json(path, {"fixed": 2})
            self.assertEqual(json.loads(path.read_text()), {"fixed": 1})

    def test_evaluation_checks_repair_before_inference(self):
        with mock.patch.object(repair, "verify_repair", side_effect=RuntimeError("changed artifact")), mock.patch.object(repair, "run_rows") as run:
            with self.assertRaisesRegex(RuntimeError, "changed artifact"):
                repair.evaluate()
            run.assert_not_called()

    def test_evaluation_image_hash_is_checked_before_decode(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "data").mkdir()
            file = root / "data" / "example.bin"
            file.write_bytes(b"registered synthetic image bytes")
            row = {"images": [{"local_path": "data/example.bin", "source_sha256": repair.sha256(file)}]}
            with mock.patch.object(repair, "ROOT", root), mock.patch.object(repair, "original_image_tensor", return_value="decoded") as decode:
                self.assertEqual(repair.image_tensor(row), "decoded")
                decode.assert_called_once_with(row)
                file.write_bytes(b"changed bytes")
                with self.assertRaisesRegex(RuntimeError, "differs"):
                    repair.image_tensor(row)
                decode.assert_called_once()

    def test_evaluation_image_path_must_remain_under_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            file = root / "outside.bin"
            file.write_bytes(b"outside")
            row = {"images": [{"local_path": "outside.bin", "source_sha256": repair.sha256(file)}]}
            with mock.patch.object(repair, "ROOT", root), mock.patch.object(repair, "original_image_tensor") as decode:
                with self.assertRaisesRegex(RuntimeError, "differs"):
                    repair.image_tensor(row)
                decode.assert_not_called()

    def test_runtime_outputs_must_be_finite_three_class_logits(self):
        runtime = mock.Mock()
        for output in [np.zeros((3,), dtype=np.float32), np.array([[0., 1., np.nan]])]:
            runtime.run.return_value = [output]
            with mock.patch.object(repair, "image_tensor", return_value=np.zeros((1, 3, 224, 224), dtype=np.float32)):
                with self.assertRaisesRegex(ValueError, "Invalid"):
                    repair.run_rows(runtime, [{}], "synthetic")


if __name__ == "__main__":
    unittest.main()
