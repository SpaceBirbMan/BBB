import asyncio
import os
from pathlib import Path
from services.dicom_service import dicom_to_png_bytes, save_png_temp
from services.neural_service import run_inference, ensure_orchestrator

def main():
    ensure_orchestrator()
    print("Orchestrator ensured")

    dicom_path = r"c:\Users\mxapr\OneDrive\Рабочий стол\Hahaton\dicom\00000002.dicom"
    print(f"Reading DICOM from: {dicom_path}")

    with open(dicom_path, "rb") as f:
        file_bytes = f.read()

    png_bytes, img_width, img_height, spacing = dicom_to_png_bytes(file_bytes)
    print(f"DICOM converted to PNG. Size: {img_width}x{img_height}")

    tmp_png_path = save_png_temp(png_bytes)
    print(f"Saved PNG to temp: {tmp_png_path}")

    try:
        points = run_inference(tmp_png_path)
        print("Inference Result:", points)
    finally:
        os.unlink(tmp_png_path)

if __name__ == "__main__":
    main()
