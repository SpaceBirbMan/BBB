import argparse
import json
import sys
import os
from PIL import Image
from pathlib import Path
from typing import Optional, Tuple, List, Dict

# Глобальное состояние
config = {
    "size": 512,
    "crop_mode": "center_square",
    "custom_crop": None,
}
normalized_cache: Dict[str, dict] = {}


def calculate_crop(img: Image.Image, crop_mode: str, custom_crop: Optional[List[int]]) -> Tuple[int, int, int, int]:
    """Вычисление области обрезки (x, y, w, h)"""
    w, h = img.size

    if custom_crop:
        return tuple(custom_crop)

    # По умолчанию — центральный квадрат
    side = min(w, h)
    x = (w - side) // 2
    y = (h - side) // 2
    return (x, y, side, side)


def normalize_image(image_path: str, crop: Tuple[int, int, int, int], size: int) -> Tuple[
    str, Tuple[int, int], Tuple[int, int]]:
    img = Image.open(image_path).convert("RGB")
    original_size = img.size

    x, y, w, h = crop
    # Обрезаем только если нужно
    if x != 0 or y != 0 or w != original_size[0] or h != original_size[1]:
        img = img.crop((x, y, x + w, y + h))

    img_resized = img.resize((size, size), Image.LANCZOS)

    output_path = f"normalized_{Path(image_path).stem}.png"
    img_resized.save(output_path)

    return output_path, original_size, (x, y)


def convert_coords(coords: List[dict], original_size: Tuple[int, int], normalized_size: int,
                   crop_offset: Tuple[int, int]) -> List[dict]:
    ow, oh = original_size
    cw, ch = crop_offset

    scale_x = ow / normalized_size
    scale_y = oh / normalized_size

    result = []
    for pt in coords:
        x_norm = 0
        y_norm = 0

        # Парсинг формата строки "0 -- {x: 128.5, y: 256.0}" или dict
        if isinstance(pt, str):
            try:
                parts = pt.split("--")
                if len(parts) >= 2:
                    coord_str = parts[1].strip().replace("{", "").replace("}", "")
                    vals = {}
                    for item in coord_str.split(","):
                        if ":" in item:
                            k, v = item.strip().split(":")
                            vals[k.strip()] = float(v.strip())
                    x_norm = vals.get("x", 0)
                    y_norm = vals.get("y", 0)
                else:
                    continue
            except:
                continue
        elif isinstance(pt, dict):
            x_norm = pt.get("x", 0)
            y_norm = pt.get("y", 0)
        else:
            continue

        # Масштабирование + смещение кропа
        x_orig = int(x_norm * scale_x + cw)
        y_orig = int(y_norm * scale_y + ch)

        x_orig = max(0, min(x_orig, ow - 1))
        y_orig = max(0, min(y_orig, oh - 1))

        result.append({"x": x_orig, "y": y_orig})

    return result


def process_request(data: dict) -> dict:
    global config, normalized_cache

    cmd = data.get("cmd", "normalize")

    if cmd == "ping":
        return {"status": "alive", "config": config}

    elif cmd == "configure":
        if "size" in data:
            config["size"] = int(data["size"])
        if "crop_mode" in data:
            config["crop_mode"] = data["crop_mode"]
        if "custom_crop" in data:
            config["custom_crop"] = data["custom_crop"]
        return {"status": "configured", "config": config}

    elif cmd == "normalize":
        image_path = data.get("image_path")
        if not image_path or not os.path.exists(image_path):
            return {"error": f"Invalid image_path: {image_path}"}

        img = Image.open(image_path)
        crop = calculate_crop(img, config["crop_mode"], config.get("custom_crop"))
        img.close()

        output_path, original_size, crop_offset = normalize_image(image_path, crop, config["size"])

        cache_id = Path(image_path).stem
        normalized_cache[cache_id] = {
            "original_size": original_size,
            "crop_offset": crop_offset,
            "normalized_size": config["size"],
        }

        return {
            "status": "normalized",
            "normalized_image": output_path,
            "cache_id": cache_id,
            "original_size": list(original_size),
        }

    elif cmd == "convert_coords":
        coords = data.get("coords", [])
        cache_id = data.get("cache_id")

        if cache_id and cache_id in normalized_cache:
            cache = normalized_cache[cache_id]
            converted = convert_coords(coords, cache["original_size"], cache["normalized_size"], cache["crop_offset"])
            return {"coords": converted}

        original_size = data.get("original_size")
        if original_size and coords:
            converted = convert_coords(coords, tuple(original_size), config["size"], (0, 0))
            return {"coords": converted}

        return {"error": "No cache or original_size provided"}

    elif cmd == "stop":
        return {"status": "stopping"}

    return {"error": f"Unknown command: {cmd}"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--crop-mode", choices=["center_square", "none"], default="center_square")
    args = parser.parse_args()

    config["size"] = args.size
    config["crop_mode"] = args.crop_mode

    # Приветствие
    print(json.dumps({"status": "normalizer_ready", "config": config}, ensure_ascii=False), flush=True)

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break

            line = line.strip()
            if not line:
                continue

            data = json.loads(line)
            response = process_request(data)

            print(json.dumps(response, ensure_ascii=False), flush=True)

            if data.get("cmd") == "stop":
                break

        except json.JSONDecodeError as e:
            print(json.dumps({"error": f"JSON error: {str(e)}"}), file=sys.stderr, flush=True)
        except Exception as e:
            print(json.dumps({"error": f"Runtime error: {str(e)}"}), file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()