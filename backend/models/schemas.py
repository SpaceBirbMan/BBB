from pydantic import BaseModel
from typing import List, Optional, Tuple, Dict


class Point(BaseModel):
    id: str
    name: Optional[str] = None
    x: float
    y: float



class Measurements(BaseModel):
    acetabular_angle_left: float
    acetabular_angle_right: float
    h_distance_left: float
    h_distance_right: float
    d_distance_left: float
    d_distance_right: float


class DiagnosisDetails(BaseModel):
    alpha_score: float
    quadrant_score: float
    curve_score: float
    is_pathology: bool
    text: str

class Diagnosis(BaseModel):
    left: str   # "normal" | "pre_subluxation" | "subluxation" | "dislocation"
    right: str
    left_details: Optional[DiagnosisDetails] = None
    right_details: Optional[DiagnosisDetails] = None
    report: Optional[str] = None
    missing_points: List[str] = []


class AnalysisResponse(BaseModel):
    image: str              # base64 PNG
    points: List[Point]
    measurements: Measurements
    diagnosis: Diagnosis
    image_width: int
    image_height: int
    pixel_spacing: Optional[Tuple[float, float]] = None
    warning: Optional[str] = None
    abnormal_parameters: List[str] = []
    thresholds: Dict[str, float] = {}


class ConvertResponse(BaseModel):
    image: str
    pixel_spacing: Optional[Tuple[float, float]] = None
    warning: Optional[str] = None


class RecalculateRequest(BaseModel):
    points: List[Point]
    image_width: Optional[int] = None
    image_height: Optional[int] = None
    pixel_spacing: Optional[Tuple[float, float]] = None
    age_months: Optional[int] = None
    gender: Optional[str] = None # "boy" | "girl"


class RecalculateResponse(BaseModel):
    measurements: Measurements
    diagnosis: Diagnosis
    abnormal_parameters: List[str] = []
    thresholds: Dict[str, float] = {}
