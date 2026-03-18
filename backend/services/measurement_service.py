import math
from typing import List, Optional, Tuple, Dict
from models.schemas import Point, Measurements, Diagnosis, DiagnosisDetails


def calculate_measurements(
    points: List[Point], 
    image_width: int = 512, 
    image_height: int = 512,
    pixel_spacing: Optional[Tuple[float, float]] = None,
    age_months: Optional[int] = None,
    gender: Optional[str] = None
) -> Tuple[Measurements, Diagnosis, List[str], Dict[str, float]]:
    """
    Calculate hip dysplasia measurements from 6 keypoints.
    
    # Point mapping (from neural net, 0-indexed):
    # - p0 (id="p1"): Left acetabular roof edge (outer)
    # - p1 (id="p2"): Right acetabular roof edge (outer)
    # - p2 (id="p3"): Left Y-cartilage (Hilgenreiner left)
    # - p3 (id="p4"): Right Y-cartilage (Hilgenreiner right)  
    # - p4 (id="p5"): Left femoral head top (highest point)
    # - p5 (id="p6"): Right femoral head top (highest point)
    """

    pts = {p.id: p for p in points}
    
    # Get the six points (fallback to sequential if ids not matching)
    ordered = sorted(points, key=lambda p: p.id)
    
    def get_pt(pid: str, fallback_idx: int) -> Point:
        if pid in pts:
            return pts[pid]
        if fallback_idx < len(ordered):
            return ordered[fallback_idx]
        return Point(id=pid, x=0, y=0)
    
    roof_left = get_pt("p1", 0)  
    roof_right = get_pt("p2", 1) 
    y_left = get_pt("p3", 2)  
    y_right = get_pt("p4", 3)  
    head_left = get_pt("p5", 4)  
    head_right = get_pt("p6", 5)  

    # --- Scale Factor Calculation ---
    if pixel_spacing:
        # pixel_spacing is (row_spacing, col_spacing)
        row_s, col_s = pixel_spacing
    else:
        # Fallback heuristic: 150mm / image_width
        s = 150.0 / image_width if image_width > 0 else 1.0
        row_s, col_s = s, s

    # Helper to convert Point to (x_mm, y_mm)
    def to_mm(p: Point):
        return p.x * col_s, p.y * row_s

    rl_mm = to_mm(roof_left)
    rr_mm = to_mm(roof_right)
    yl_mm = to_mm(y_left)
    yr_mm = to_mm(y_right)
    hl_mm = to_mm(head_left)
    hr_mm = to_mm(head_right)

    # --- Hilgenreiner line Vector in MM ---
    hx = yr_mm[0] - yl_mm[0]
    hy = yr_mm[1] - yl_mm[1]
    hlen = math.sqrt(hx * hx + hy * hy)
    if hlen == 0:
        hx, hy = 1.0, 0.0
        hlen = 1.0
    
    ux = hx / hlen
    uy = hy / hlen

    # --- Distance d & h: using vector projections in MM space ---
    vl_x = hl_mm[0] - yl_mm[0]
    vl_y = hl_mm[1] - yl_mm[1]
    d_left_mm = abs(vl_x * ux + vl_y * uy)
    h_left_mm = abs(ux * vl_y - uy * vl_x)

    vr_x = hr_mm[0] - yr_mm[0]
    vr_y = hr_mm[1] - yr_mm[1]
    d_right_mm = abs(vr_x * ux + vr_y * uy)
    h_right_mm = abs(ux * vr_y - uy * vr_x)

    # --- Acetabular angle ---
    def vector_angle(ax: float, ay: float, bx: float, by: float) -> float:
        dot = ax * bx + ay * by
        mag_a = math.sqrt(ax*ax + ay*ay)
        mag_b = math.sqrt(bx*bx + by*by)
        if mag_a == 0 or mag_b == 0:
            return 0.0
        val = dot / (mag_a * mag_b)
        val = max(-1.0, min(1.0, val))
        return math.degrees(math.acos(val))

    # Angle between Hilgenreiner line and acetabular roof
    # Use roof point - Y point vector in MM
    rl_vec_x = rl_mm[0] - yl_mm[0]
    rl_vec_y = rl_mm[1] - yl_mm[1]
    angle_left = vector_angle(-ux, -uy, rl_vec_x, rl_vec_y)

    rr_vec_x = rr_mm[0] - yr_mm[0]
    rr_vec_y = rr_mm[1] - yr_mm[1]
    angle_right = vector_angle(ux, uy, rr_vec_x, rr_vec_y)

    # --- Diagnosis and Abnormal Parameter Detection ---
    abnormal_parameters = []
    
    # Thresholds (upper limits for "normal")
    alpha_thresholds = {
        0: (34.0, 36.0),    # Newborn
        3: (30.0, 32.0),
        6: (27.0, 29.0),
        12: (24.0, 25.0),
        24: (22.0, 23.0),
        36: (20.0, 21.0),
        60: (18.0, 19.0)
    }
    
    # age_months: (min_h, max_d)
    hd_thresholds = {
        6: (9.0, 15.0),
        12: (10.0, 14.0),
        24: (11.0, 13.0),
        36: (12.0, 12.0),
        60: (13.0, 11.0)
    }
    
    def get_alpha_limit(months, p_gender):
        ages = sorted(alpha_thresholds.keys(), reverse=True)
        for a in ages:
            if months >= a:
                boy_t, girl_t = alpha_thresholds[a]
                return boy_t if p_gender != "girl" else girl_t
        return 34.0
        
    def get_hd_limit(months):
        ages = sorted(hd_thresholds.keys(), reverse=True)
        for a in ages:
            if months >= a:
                return hd_thresholds[a]
        return (9.0, 15.0)
    
    effective_age = age_months if age_months is not None else 6
    effective_gender = gender if gender else "boy"
    
    max_alpha = get_alpha_limit(effective_age, effective_gender)
    min_h, max_d = get_hd_limit(effective_age)
    
    # Check Left Side
    left_status = "normal"
    if angle_left > max_alpha:
        abnormal_parameters.append("acetabular_angle_left")
        left_status = "pre_subluxation"
    
    if h_left_mm < min_h:
        abnormal_parameters.append("h_distance_left")
        left_status = "subluxation"
        
    if d_left_mm > max_d:
        abnormal_parameters.append("d_distance_left")
        if left_status == "normal": left_status = "pre_subluxation"
        elif left_status == "pre_subluxation": left_status = "subluxation"

    if h_left_mm < min_h / 2 or d_left_mm > max_d + 5:
        left_status = "dislocation"

    # Check Right Side
    right_status = "normal"
    if angle_right > max_alpha:
        abnormal_parameters.append("acetabular_angle_right")
        right_status = "pre_subluxation"
    
    if h_right_mm < min_h:
        abnormal_parameters.append("h_distance_right")
        right_status = "subluxation"
        
    if d_right_mm > max_d:
        abnormal_parameters.append("d_distance_right")
        if right_status == "normal": right_status = "pre_subluxation"
        elif right_status == "pre_subluxation": right_status = "subluxation"

    if h_right_mm < min_h / 2 or d_right_mm > max_d + 5:
        right_status = "dislocation"

    # --- Fuzzy Logic Triad of Putti ---
    def get_named_pt(name: str):
        if name in pts and not (pts[name].x == 0 and pts[name].y == 0):
            return pts[name]
        return None

    def curve_deviation(pt_names):
        curve_pts = [get_named_pt(n) for n in pt_names]
        if any(p is None for p in curve_pts):
            return 0.0
        max_angle = 0.0
        for i in range(len(curve_pts) - 2):
            v1x = curve_pts[i+1].x - curve_pts[i].x
            v1y = curve_pts[i+1].y - curve_pts[i].y
            v2x = curve_pts[i+2].x - curve_pts[i+1].x
            v2y = curve_pts[i+2].y - curve_pts[i+1].y
            mag1 = math.sqrt(v1x*v1x + v1y*v1y)
            mag2 = math.sqrt(v2x*v2x + v2y*v2y)
            if mag1 == 0 or mag2 == 0:
                continue
            dot = (v1x*v2x + v1y*v2y) / (mag1*mag2)
            dot = max(-1.0, min(1.0, dot))
            angle = math.degrees(math.acos(dot))
            if angle > max_angle:
                max_angle = angle
        # Increased threshold to allow natural anatomical arc bends
        score = (max_angle - 30.0) / 40.0
        return max(0.0, min(1.0, score))

    shenton_left = curve_deviation(["ШН-Л", "ШЛВ-Л", "ШПВ-Л", "ШП-Л"])
    shenton_right = curve_deviation(["ШЛ-П", "ШЛВ-П", "ШПВ-П", "ШН-П"])
    calve_left = curve_deviation(["ББК-Л", "БВК-Л", "ТВ-Л", "ТБ-Л"])
    calve_right = curve_deviation(["ББК-П", "БВК-П", "ТВ-П", "ТБ-П"])

    curve_score_left = max(shenton_left, calve_left)
    curve_score_right = max(shenton_right, calve_right)

    # --- Nuclei Calculation ---
    def calc_nucleus(suffix: str):
        pl = get_named_pt("ЯОЛК" + suffix)
        pr = get_named_pt("ЯОПК" + suffix)
        pu = get_named_pt("ЯОВК" + suffix)
        pd = get_named_pt("ЯОНК" + suffix)
        if not (pl and pr and pu and pd): return None
        cx = (pl.x + pr.x) / 2
        cy = (pu.y + pd.y) / 2
        w_mm = abs(pr.x - pl.x) * col_s
        h_mm = abs(pd.y - pu.y) * row_s
        if w_mm == 0 and h_mm == 0: return None
        return {"cx": cx, "cy": cy, "pt": Point(id="center", x=cx, y=cy), "w": round(w_mm, 1), "h": round(h_mm, 1)}

    nucleus_left = calc_nucleus("-Л")
    nucleus_right = calc_nucleus("-П")

    # --- Perkin Quadrants ---
    def get_quadrant_projections(target_pt, roof_pt, is_left: bool):
        if not target_pt or not roof_pt:
            return 0.0, 0.0
        vx = target_pt.x - roof_pt.x
        vy = target_pt.y - roof_pt.y
        sup_proj = vx * uy + vy * (-ux)
        lat_proj = vx * (-ux) + vy * (-uy) if is_left else vx * ux + vy * uy
        return sup_proj, lat_proj

    shlv_l = get_named_pt("ШЛВ-Л")
    shpv_p = get_named_pt("ШПВ-П")
    
    target_l = nucleus_left['pt'] if nucleus_left else shlv_l
    target_r = nucleus_right['pt'] if nucleus_right else shpv_p

    sup_l, lat_l = get_quadrant_projections(target_l, roof_left, is_left=True)
    sup_r, lat_r = get_quadrant_projections(target_r, roof_right, is_left=False)

    def in_outer_upper_quadrant(sup, lat):
        if sup > 0 and lat > 0: return 1.0
        elif sup > -5 and lat > -5: return 0.5
        return 0.0

    quad_score_left = in_outer_upper_quadrant(sup_l, lat_l)
    quad_score_right = in_outer_upper_quadrant(sup_r, lat_r)

    def fuzzy_alpha(alpha, max_a):
        if alpha <= max_a: return 0.0
        return min(1.0, (alpha - max_a) / 5.0)

    alpha_score_left = fuzzy_alpha(angle_left, max_alpha)
    alpha_score_right = fuzzy_alpha(angle_right, max_alpha)

    fuzzy_sum_left = alpha_score_left + quad_score_left + curve_score_left
    fuzzy_sum_right = alpha_score_right + quad_score_right + curve_score_right

    is_pathology_left = fuzzy_sum_left >= 0.5
    is_pathology_right = fuzzy_sum_right >= 0.5

    def get_pathology_text(fuzzy_sum):
        if fuzzy_sum < 0.5: return "Норма"
        if fuzzy_sum < 1.2: return "Подозрение на дисплазию (Предвывих)"
        if fuzzy_sum < 2.0: return "Дисплазия (Подвывих)"
        return "Дисплазия (Вывих)"

    left_details = DiagnosisDetails(
        alpha_score=round(alpha_score_left, 2),
        quadrant_score=round(quad_score_left, 2),
        curve_score=round(curve_score_left, 2),
        is_pathology=is_pathology_left,
        text="Патология выявлена" if is_pathology_left else "Патология не выявлена"
    )
    right_details = DiagnosisDetails(
        alpha_score=round(alpha_score_right, 2),
        quadrant_score=round(quad_score_right, 2),
        curve_score=round(curve_score_right, 2),
        is_pathology=is_pathology_right,
        text="Патология выявлена" if is_pathology_right else "Патология не выявлена"
    )

    measurements = Measurements(
        acetabular_angle_left=round(angle_left, 1),
        acetabular_angle_right=round(angle_right, 1),
        h_distance_left=round(h_left_mm, 1),
        h_distance_right=round(h_right_mm, 1),
        d_distance_left=round(d_left_mm, 1),
        d_distance_right=round(d_right_mm, 1),
    )

    # --- Generate Text Report ---
    def get_quadrant_name(sup, lat):
        if sup > 0 and lat > 0: return "в верхне-наружном квадранте"
        if sup > 0 and lat <= 0: return "в верхне-внутреннем квадранте"
        if sup <= 0 and lat > 0: return "в нижне-наружном квадранте"
        return "в нижне-внутреннем квадранте"

    report_lines = [
        "На рентгенограмме тазобедренных суставов в прямой проекции костной деструкции не определяется. Симметричность тазового кольца не нарушена."
    ]

    has_pathology = is_pathology_left or is_pathology_right
    if not has_pathology:
        # Вариант 3 (Норма)
        report_lines.append(f"Анатомические соотношения в суставах не нарушены. Крыши вертлужных впадин сформированы, не скошены. Ацетабулярный угол справа {round(angle_right)}°, слева {round(angle_left)}° (в пределах нормы).")
        
        if nucleus_left and nucleus_right:
            report_lines.append(f"Ядра окостенений головок бедренных костей визуализируются (справа {nucleus_right['w']}x{nucleus_right['h']} мм, слева {nucleus_left['w']}x{nucleus_left['h']} мм), симметричные.")
        else:
            report_lines.append("Ядра окостенения бедренных костей не визуализируются.")
            
        report_lines.append(f"Бедренные кости центрированы правильно (справа h={round(h_right_mm)}мм d={round(d_right_mm)}мм, слева h={round(h_left_mm)}мм d={round(d_left_mm)}мм). Линии Шентона и Кальве непрерывные дугообразные.")
        report_lines.append("\nЗаключение: На момент осмотра без видимой патологии.")
    else:
        # Вариант 1 / Вариант 2
        def describe_joint(side_txt, angle, max_angle, nuc, sup, lat, h_val, d_val, curve_sc):
            lines = []
            roof_desc = "скошена, уплощена" if angle > max_angle else "дугообразной формы, края сформированы"
            lines.append(f"{side_txt} крыша вертлужной впадины {roof_desc}. Ацетабулярный угол {side_txt.lower()} {round(angle)}°.")
            
            if nuc:
                lines.append(f"{side_txt} ядро окостенения размерами {nuc['w']}x{nuc['h']} мм, расположено {get_quadrant_name(sup, lat)}.")
            else:
                lines.append(f"{side_txt} ядро окостенения не визуализируется.")
                
            pos_desc = "диафиз бедренной кости смещен" if (h_val < min_h / 2 or d_val > max_d + 5) else "диафиз бедренной кости расположен правильно"
            lines.append(f"{side_txt} {pos_desc} (h={round(h_val)} мм, d={round(d_val)} мм).")
            
            curve_desc = "деформированы и прерывистые" if curve_sc > 0.5 else "правильные, дугообразные"
            lines.append(f"{side_txt} линии Шентона и Кальве {curve_desc}.")
            return " ".join(lines)

        report_lines.append(describe_joint("Справа", angle_right, max_alpha, nucleus_right, sup_r, lat_r, h_right_mm, d_right_mm, curve_score_right))
        report_lines.append(describe_joint("Слева", angle_left, max_alpha, nucleus_left, sup_l, lat_l, h_left_mm, d_left_mm, curve_score_left))

        diag_right = get_pathology_text(fuzzy_sum_right)
        diag_left = get_pathology_text(fuzzy_sum_left)
        
        severity_conclusions = []
        severity_conclusions.append(f"Справа: {diag_right}.")
        severity_conclusions.append(f"Слева: {diag_left}.")
        
        report_lines.append(f"\nЗаключение:\n" + "\n".join(severity_conclusions))

    missing_points_names = []
    for p in points:
        if p.x == 0 and p.y == 0:
            name_to_use = getattr(p, "name", p.id)
            if not name_to_use:
                name_to_use = p.id
            if name_to_use == "p1": name_to_use = "Крыша-Л"
            elif name_to_use == "p2": name_to_use = "Крыша-П"
            elif name_to_use == "p3": name_to_use = "Y-хрящ-Л"
            elif name_to_use == "p4": name_to_use = "Y-хрящ-П"
            elif name_to_use == "p5": name_to_use = "Бедро-Л"
            elif name_to_use == "p6": name_to_use = "Бедро-П"
            
            if name_to_use not in missing_points_names:
                missing_points_names.append(name_to_use)

    diagnosis = Diagnosis(
        left=left_status, 
        right=right_status,
        left_details=left_details,
        right_details=right_details,
        report="\n\n".join(report_lines),
        missing_points=missing_points_names
    )
    
    thresholds = {
        "max_alpha": round(max_alpha, 1),
        "min_h": round(min_h, 1),
        "max_d": round(max_d, 1)
    }

    return measurements, diagnosis, abnormal_parameters, thresholds
