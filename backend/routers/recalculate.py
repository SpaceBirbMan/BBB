from fastapi import APIRouter, HTTPException

from models.schemas import RecalculateRequest, RecalculateResponse
from services.measurement_service import calculate_measurements

router = APIRouter()


@router.post("/recalculate", response_model=RecalculateResponse)
async def recalculate(body: RecalculateRequest):
    """
    Recalculate measurements based on updated point positions.
    Used when user drags points in the viewer.
    """
    if len(body.points) < 6:
        raise HTTPException(
            status_code=400,
            detail=f"Need exactly 6 points, got {len(body.points)}"
        )

    measurements, diagnosis, abnormal_params, thresholds = calculate_measurements(
        body.points,
        image_width=body.image_width or 512,
        image_height=body.image_height or 512,
        pixel_spacing=body.pixel_spacing,
        age_months=body.age_months,
        gender=body.gender
    )

    return RecalculateResponse(
        measurements=measurements, 
        diagnosis=diagnosis,
        abnormal_parameters=abnormal_params,
        thresholds=thresholds
    )
