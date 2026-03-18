import io
import base64
import tempfile
import os
from pathlib import Path
from typing import Tuple, Optional

import numpy as np
from PIL import Image, ImageEnhance, ImageOps


def dicom_to_png_bytes(file_bytes: bytes) -> Tuple[bytes, int, int, Optional[Tuple[float, float]]]:
    """
    Convert DICOM file bytes to PNG bytes using pydicom.
    Returns (png_bytes, width, height, (row_spacing, col_spacing)).
    """
    pixel_spacing_pair = None
    # Try pydicom first
    try:
        import pydicom
        
        # Write to temp file
        with tempfile.NamedTemporaryFile(suffix=".dcm", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        
        try:
            ds = pydicom.dcmread(tmp_path)
            pixel_data = ds.pixel_array.astype(np.float32)
            
            # Extract spacing exactly as user suggested
            try:
                ps = None
                if 'PixelSpacing' in ds:
                    ps = ds.PixelSpacing
                    print(f"[DICOM] Found PixelSpacing: {ps}")
                elif 'ImagerPixelSpacing' in ds:
                    ps = ds.ImagerPixelSpacing
                    print(f"[DICOM] Found ImagerPixelSpacing: {ps}")
                
                if ps:
                    # DICOM (0028,0030) is [Row Spacing (Vertical), Column Spacing (Horizontal)]
                    row_s = float(ps[0])
                    col_s = float(ps[1])
                    pixel_spacing_pair = (row_s, col_s)
                else:
                    print("[DICOM] No pixel spacing tags found")
            except Exception as se:
                print(f"[DICOM] Error parsing spacing: {se}")
            
            # Handle multi-frame
            if pixel_data.ndim == 3:
                pixel_data = pixel_data[0]
            
            # Normalize to 0-255
            pmin, pmax = pixel_data.min(), pixel_data.max()
            if pmax > pmin:
                pixel_data = (pixel_data - pmin) / (pmax - pmin) * 255.0
            else:
                pixel_data = np.zeros_like(pixel_data)
            
            pixel_data = pixel_data.astype(np.uint8)
            img = Image.fromarray(pixel_data, mode='L').convert('RGB')
            
        finally:
            os.unlink(tmp_path)
        
    except Exception:
        # Fallback: try to open as regular image
        try:
            img = Image.open(io.BytesIO(file_bytes)).convert('RGB')
        except Exception as e:
            raise ValueError(f"Cannot process file as DICOM or image: {e}")
    
    width, height = img.size
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    buf.seek(0)
    
    return buf.read(), width, height, pixel_spacing_pair


def png_bytes_to_base64(png_bytes: bytes) -> str:
    """Convert PNG bytes to base64 data URI."""
    b64 = base64.b64encode(png_bytes).decode('utf-8')
    return f"data:image/png;base64,{b64}"


def save_png_temp(png_bytes: bytes) -> str:
    """Save PNG to a temp file, return path. Caller must delete."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(png_bytes)
        return tmp.name
