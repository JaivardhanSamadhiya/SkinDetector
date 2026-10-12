import io
import numpy as np
from PIL import Image
import pytest
import torch

from backend.images import MAX_FILE_BYTES, ImageValidationError, assess_quality, decode_image, preprocess


def encoded(mode="RGB", fmt="PNG", size=(64, 48)):
    pixels = np.indices((size[1], size[0])).sum(axis=0).astype(np.uint8) * 3
    array = np.stack([pixels, np.roll(pixels, 10, 1), np.roll(pixels, 20, 0)], axis=-1)
    image = Image.fromarray(array).convert(mode)
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


@pytest.mark.parametrize("fmt,mime", [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")])
def test_supported_decodable_files(fmt, mime):
    result = decode_image(encoded(fmt=fmt), mime)
    assert result.mode == "RGB" and result.size == (64, 48)


@pytest.mark.parametrize("data,mime,status", [(b"", "image/png", 400), (b"<script>alert(1)</script>", "image/png", 400), (b"test", "text/html", 415), (b"test", None, 415)])
def test_invalid_file_feedback(data, mime, status):
    with pytest.raises(ImageValidationError) as error:
        decode_image(data, mime)
    assert error.value.status == status


def test_mime_spoofing_rejected():
    with pytest.raises(ImageValidationError, match="do not match"):
        decode_image(encoded(), "image/jpeg")


def test_file_size_boundary():
    with pytest.raises(ImageValidationError) as error:
        decode_image(b"x" * (MAX_FILE_BYTES + 1), "image/png")
    assert error.value.status == 413


def test_decompression_bomb_rejected(monkeypatch):
    image = encoded(size=(64, 48))
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 1000)
    with pytest.raises(ImageValidationError) as error:
        decode_image(image, "image/png")
    assert error.value.status == 413


def test_animated_file_rejected():
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), "red").save(buffer, format="PNG", save_all=True, append_images=[Image.new("RGB", (32, 32), "blue")])
    with pytest.raises(ImageValidationError, match="Animated"):
        decode_image(buffer.getvalue(), "image/png")


def test_exif_orientation_is_applied():
    exif = Image.Exif()
    exif[274] = 6
    buffer = io.BytesIO()
    Image.new("RGB", (32, 48), "red").save(buffer, "JPEG", exif=exif)
    assert decode_image(buffer.getvalue(), "image/jpeg").size == (48, 32)


def test_transparent_pixels_composited_white():
    buffer = io.BytesIO()
    Image.new("RGBA", (32, 32), (255, 0, 0, 0)).save(buffer, "PNG")
    assert decode_image(buffer.getvalue(), "image/png").getpixel((0, 0)) == (255, 255, 255)


def test_preprocessing_normalization_and_layout():
    tensor = preprocess(Image.new("RGB", (28, 28), (255, 128, 0)), [.5, .5, .5], [.25, .25, .25])
    assert tensor.shape == (1, 3, 28, 28) and tensor.dtype == torch.float32
    assert np.allclose(tensor[0, :, 0, 0], [2, (128 / 255 - .5) / .25, -2], atol=1e-6)
    assert torch.equal(tensor, preprocess(Image.new("RGB", (28, 28), (255, 128, 0)), [.5] * 3, [.25] * 3))


def test_nearest_pixel_center_resize_matches_documented_js_rule():
    pixels = np.arange(37 * 45 * 3).reshape(37, 45, 3).astype(np.uint8)
    image = Image.fromarray(pixels)
    output = preprocess(image, [0, 0, 0], [1, 1, 1])[0].numpy().transpose(1, 2, 0)
    expected = pixels[(np.floor((np.arange(28) + .5) * 37 / 28)).astype(int)[:, None], (np.floor((np.arange(28) + .5) * 45 / 28)).astype(int)[None, :]] / 255
    assert np.allclose(output, expected, atol=1e-7)


@pytest.mark.parametrize("color,code", [("black", "underexposure"), ("white", "overexposure"), ("gray", "blur")])
def test_blank_images_rejected(color, code):
    result = assess_quality(Image.new("RGB", (256, 256), color))
    assert not result.passed
    assert any(issue.code == code and issue.severity == "error" for issue in result.issues)


def test_small_dimensions_rejected():
    result = assess_quality(decode_image(encoded(size=(20, 20)), "image/png"))
    assert any(issue.code == "resolution" for issue in result.issues)


def test_quality_does_not_assert_medical_suitability():
    result = assess_quality(decode_image(encoded(), "image/png"))
    assert result.passed
    assert 0 <= result.brightness <= 1
    assert any(issue.code == "low_resolution" for issue in result.issues)
