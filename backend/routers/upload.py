import os
import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from typing import Optional

from models.schemas import AnalysisResponse, ConvertResponse
from services.dicom_service import dicom_to_png_bytes, png_bytes_to_base64, save_png_temp
from services.neural_service import run_inference
from services.measurement_service import calculate_measurements

router = APIRouter()


@router.post("/upload", response_model=AnalysisResponse)
async def upload_dicom(
    file: UploadFile = File(...),
    pixel_spacing: Optional[str] = Form(None),
    age_months: Optional[int] = Form(None),
    gender: Optional[str] = Form(None)
):
    """
    Accept a DICOM (or image) file, convert to PNG, run neural inference,
    calculate measurements, return structured analysis result.
    pixel_spacing can be "row,col" string.
    """
    # Parse pixel_spacing if provided
    spacing_pair = None
    if pixel_spacing:
        try:
            parts = [float(x.strip()) for x in pixel_spacing.split(',')]
            if len(parts) == 2:
                spacing_pair = (parts[0], parts[1])
            elif len(parts) == 1:
                spacing_pair = (parts[0], parts[0])
        except Exception:
            pass
    # Read file bytes
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    # Convert DICOM → PNG
    try:
        png_bytes, img_width, img_height, ds_spacing = dicom_to_png_bytes(file_bytes)
        print(f"[Upload] DICOM spacing from file: {ds_spacing}")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Cannot process file: {e}")

    # Use provided spacing if available, otherwise what we got from DICOM
    print(f"[Upload] Received form spacing_pair: {spacing_pair}")
    final_spacing = spacing_pair if spacing_pair is not None else ds_spacing
    print(f"[Upload] Using final_spacing: {final_spacing}")

    # Save PNG to temp file for neural net
    tmp_png_path = save_png_temp(png_bytes)
    
    try:
        # Run neural network inference
        points = run_inference(tmp_png_path)
    finally:
        try:
            os.unlink(tmp_png_path)
        except Exception:
            pass

    # Calculate medical measurements
    measurements, diagnosis, abnormal_params, thresholds = calculate_measurements(
        points, img_width, img_height, 
        pixel_spacing=final_spacing,
        age_months=age_months,
        gender=gender
    )

    # Convert PNG to base64 for frontend
    image_b64 = png_bytes_to_base64(png_bytes)

    warning = None
    if final_spacing is None:
        warning = "Внимание: В файле отсутствуют данные о физическом масштабе (PixelSpacing). Расчеты в мм могут быть неточными."

    return AnalysisResponse(
        image=image_b64,
        points=points,
        measurements=measurements,
        diagnosis=diagnosis,
        image_width=img_width,
        image_height=img_height,
        pixel_spacing=final_spacing,
        warning=warning,
        abnormal_parameters=abnormal_params,
        thresholds=thresholds
    )


@router.post("/convert", response_model=ConvertResponse)
async def convert_only(file: UploadFile = File(...)):
    """
    Accept a DICOM (or image) file, convert to PNG, return base64 and pixel spacing.
    Used for frontend cropping before actual analysis.
    """
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        png_bytes, img_width, img_height, pixel_spacing = dicom_to_png_bytes(file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Cannot process file: {e}")

    image_b64 = png_bytes_to_base64(png_bytes)
    
    warning = None
    if pixel_spacing is None:
        warning = "Внимание: В файле отсутствуют данные о физическом масштабе (PixelSpacing). Расчеты в мм могут быть неточными."

    return ConvertResponse(image=image_b64, pixel_spacing=pixel_spacing, warning=warning)
