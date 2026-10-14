"""Prepare fresh, locked-model references for genuine browser WASM verification.

Run only after the deployment repair evaluation has finished. This does not
train, tune, select test examples, alter release gates, or publish an artifact.
The first twelve validation cases are fixed by the existing repair protocol.
Decoded, EXIF-oriented RGB PNGs isolate browser computation from differences
between Pillow and Chromium JPEG decoders; original source hashes remain bound.
"""
from __future__ import annotations

import argparse
import gc
import json
from pathlib import Path

import numpy as np
from PIL import Image
import torch

from photo_model_common import (ROOT, DATA, MODEL, SIZE, PhotoModel, load_backbone,
                                preprocess, rgb_image, sha256, write_json,
                                preprocessing_fingerprint)
from photo_model_deployment_repair import immutable_json, verify_repair, verify_original
from photo_model_train import cohort, setup

PROTOCOL = {
    "version": 1,
    "purpose": "Browser WASM serialization and preprocessing verification; not classification accuracy or clinical validation",
    "sample_policy": "First12 validation cases in unchanged combined-cohort order; same fixed cases as deployment repair",
    "reference": "Fresh PyTorch execution of the locked backbone and trained head; original validation-selected temperature unchanged",
    "image_decode": "Pillow EXIF-oriented, alpha-on-white RGB decoded pixels saved losslessly to PNG; browser decodes this canonical PNG",
    "preprocessing": "Actual resizeNearest and normalizePixels functions extracted from lib/browser-inference.ts; tensor compared with shared Python preprocess",
    "maximum_absolute_tensor_error": 0.000001,
    "maximum_absolute_logit_error": 0.005,
    "require_matching_top_labels": True,
    "runtime": "Actual Chromium onnxruntime-web WASM, one thread, local same-origin model parts verified individually and together",
    "release_policy": "Write a separate verification report; never alter manifests, model selection, final-test or export locks",
    "clinical_validation": False,
}


def prepare():
    if not (MODEL / "deployment-evaluation.json").exists():
        raise RuntimeError("Finish the locked deployment evaluation before creating another model process.")
    immutable_json(MODEL / "browser-verification-protocol.json", PROTOCOL)
    source, lock, _ = verify_repair()
    _, head = verify_original()
    rows = [row for row in cohort()["records"] if row["split"] == "validation"][:12]
    if len(rows) != 12:
        raise RuntimeError("The fixed verification set requires12 validation cases.")
    destination = DATA / "browser-qa"
    reference_path = destination / "reference.json"
    binding = {
        "repair_lock_sha256": sha256(MODEL / "deployment-repair-lock.json"),
        "evaluation_sha256": sha256(MODEL / "deployment-evaluation.json"),
        "cohort_sha256": sha256(DATA / "combined-cohort.json"),
        "head_sha256": source["lock"]["head_sha256"],
        "preprocessing_sha256": preprocessing_fingerprint(),
        "browser_preprocessing_source_sha256": sha256(ROOT / "lib/browser-inference.ts"),
        "protocol_sha256": sha256(MODEL / "browser-verification-protocol.json"),
        "onnx_sha256": lock["onnx"]["sha256"],
    }
    if reference_path.exists():
        recorded = json.loads(reference_path.read_text(encoding="utf-8"))
        if recorded["binding"] != binding or [sample["id"] for sample in recorded["samples"]] != [row["id"] for row in rows]:
            raise RuntimeError("Existing browser references do not match immutable model/cohort inputs.")
        for sample in recorded["samples"]:
            for field in ["image", "tensor"]:
                item = sample[field]
                if sha256(destination / item["filename"]) != item["sha256"]:
                    raise RuntimeError("Existing browser reference pixels/tensor changed.")
        print(json.dumps({"phase": "browser_references_already_prepared", "n": len(rows)}), flush=True)
        return
    destination.mkdir(parents=True, exist_ok=True)
    network = PhotoModel(load_backbone(source["backbone"]), head["weights"], head["bias"],
                         head.get("centers"), head.get("gamma")).eval()
    samples = []
    for index, row in enumerate(rows):
        original = row["images"][0]
        path = (ROOT / original["local_path"]).resolve()
        if not path.is_relative_to((ROOT / "data").resolve()) or sha256(path) != original["source_sha256"]:
            raise RuntimeError("Verification image differs from the locked cohort.")
        image_name, tensor_name = f"validation-{index + 1}.png", f"validation-{index + 1}.f32"
        with Image.open(path) as input_image:
            image = rgb_image(input_image)
            tensor = preprocess(input_image)[None, :]
            image.save(destination / image_name, format="PNG")
            dimensions = [image.width, image.height]
        (destination / tensor_name).write_bytes(tensor.astype("<f4").tobytes())
        with torch.inference_mode():
            logits = network(torch.from_numpy(tensor)).numpy()[0]
        if logits.shape != (3,) or not np.isfinite(logits).all():
            raise RuntimeError("Invalid fresh PyTorch reference output.")
        samples.append({"id": row["id"], "split": row["split"], "source": row["source"],
                        "original_image_sha256": original["source_sha256"],
                        "image": {"filename": image_name, "sha256": sha256(destination / image_name), "dimensions": dimensions},
                        "tensor": {"filename": tensor_name, "sha256": sha256(destination / tensor_name), "shape": [1, 3, SIZE, SIZE]},
                        "logits": logits.tolist()})
        print(json.dumps({"phase": "browser_pytorch_reference", "done": index + 1, "total": len(rows)}), flush=True)
    del network
    gc.collect()
    write_json(reference_path, {"protocol": PROTOCOL, "binding": binding, "model_version": source["version"],
                                "temperature": lock["temperature"], "onnx": lock["onnx"], "samples": samples})
    print(json.dumps({"phase": "browser_references_prepared", "n": len(samples), "reference": reference_path.relative_to(ROOT).as_posix()}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    setup()
    prepare()
