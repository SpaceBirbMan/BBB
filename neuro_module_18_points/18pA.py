import argparse
import json
import sys
import os
import torch
import torch.nn as nn
import numpy as np
from PIL import Image
from torchvision import transforms

DESCRIPTION = "Анализ альфа,d,h"


class SimpleBaseline(nn.Module):
    def __init__(self, num_keypoints, input_size=512):
        super().__init__()
        
        # 512 -> 256 -> 128 -> 64 -> 64 (stride 1 в последнем блоке)
        # Итоговое разрешение: 64x64 (downsample factor = 8)
        self.feature_map_size = input_size // 8  # 512 // 8 = 64

        self.encoder = nn.Sequential(
            nn.Conv2d(3, 64, 3, 2, 1, bias=False),   # 512 -> 256
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            
            nn.Conv2d(64, 128, 3, 2, 1, bias=False), # 256 -> 128
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            
            nn.Conv2d(128, 256, 3, 2, 1, bias=False),# 128 -> 64
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            
            # stride=1 чтобы сохранить 64x64
            nn.Conv2d(256, 512, 3, 1, 1, bias=False),# 64 -> 64
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
            
            # Дополнительный блок на том же разрешении
            nn.Conv2d(512, 512, 3, 1, 1, bias=False),
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
        )

        self.feature_refinement = nn.Sequential(
            nn.Conv2d(512, 256, 3, 1, 1, bias=False),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.Conv2d(256, 128, 3, 1, 1, bias=False),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
        )

        self.head = nn.Conv2d(128, num_keypoints, kernel_size=1, stride=1, padding=0)

    def forward(self, x):
        x = self.encoder(x)          # [B, 512, 64, 64]
        x = self.feature_refinement(x)  # [B, 128, 64, 64]
        x = self.head(x)             # [B, K, 64, 64]
        return x


_model = None
_device = None
_input_size = 512
_num_keypoints = None
_preprocess = None


def _load_model(weights_path, num_keypoints, device):
    model = SimpleBaseline(num_keypoints=num_keypoints, input_size=_input_size)
    state_dict = torch.load(weights_path, map_location=device, weights_only=True)
    if any(k.startswith("module.") for k in state_dict.keys()):
        state_dict = {k.replace("module.", ""): v for k, v in state_dict.items()}
    model.load_state_dict(state_dict)
    model.eval()
    return model


def _preprocess_image(image_path, input_size=512):
    img = Image.open(image_path).convert("RGB")
    transform = transforms.Compose([
        transforms.Resize((input_size, input_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])
    return transform(img)


def _heatmap_to_coords(heatmap, original_size=None):
    if heatmap.dim() == 4:
        heatmap = heatmap.squeeze(0)  # [K, H, W]

    K, H, W = heatmap.shape
    coords = []

    for k in range(K):
        hm = heatmap[k]
        idx = torch.argmax(hm)
        y_feat = idx // W
        x_feat = idx % W

        x_norm = (x_feat.float() + 0.5) / W
        y_norm = (y_feat.float() + 0.5) / H

        if original_size is not None:
            orig_w, orig_h = original_size
            x_px = x_norm * orig_w
            y_px = y_norm * orig_h
            coords.append({"x": round(x_px.item(), 2), "y": round(y_px.item(), 2)})
        else:
            coords.append({"x": round(x_norm.item(), 4), "y": round(y_norm.item(), 4)})

    return coords


def init_module(weights_path, device=None):
    global _model, _device, _num_keypoints, _preprocess

    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    _device = torch.device(device)
    _num_keypoints = 18  # ИЗМЕНЕНО: было 6
    _model = _load_model(weights_path, _num_keypoints, _device).to(_device)

    _preprocess = transforms.Compose([
        transforms.Resize((_input_size, _input_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])

    return {"status": "ready", "device": device, "keypoints": _num_keypoints}


def analyze(image_path, return_pixels=False, original_size=None):
    global _model, _device, _preprocess

    if _model is None:
        raise RuntimeError("Module not initialized. Call init_module() first.")

    tensor = _preprocess(Image.open(image_path).convert("RGB"))
    tensor = tensor.unsqueeze(0).to(_device)  # [1, 3, 512, 512]

    with torch.no_grad():
        heatmaps = _model(tensor)  # [1, 18, 64, 64]

    size = original_size if return_pixels else None
    coords = _heatmap_to_coords(heatmaps, original_size=size)

    result = []
    for idx, coord in enumerate(coords):
        result.append(f"{idx} -- {{x: {coord['x']}, y: {coord['y']}}}")

    return {"coords": result}


def read_input():
    return json.load(sys.stdin)


def write_output(data):
    print(json.dumps(data, ensure_ascii=False), flush=True)


def check():
    return {
        "description": DESCRIPTION,
        "input_format": {"image_path": "str"},
        "output_format": {"coords": ["point_idx -- {x: val, y: val}", "..."]},
        "keypoints": _num_keypoints if _num_keypoints else "not_initialized"
    }


def _persistent_loop():
    write_output({"status": "running", "info": check()})

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break

            request = json.loads(line.strip())
            cmd = request.get("cmd", "analyze")

            if cmd == "ping":
                write_output({"status": "alive"})

            elif cmd == "analyze":
                img_path = request.get("image_path")
                if not img_path or not os.path.exists(img_path):
                    write_output({"error": f"Invalid image_path: {img_path}"})
                    continue

                try:
                    with Image.open(img_path) as img:
                        orig_size = img.size
                except:
                    orig_size = None

                result = analyze(img_path, return_pixels=True, original_size=orig_size)
                write_output(result)

            elif cmd == "stop":
                write_output({"status": "stopping"})
                break

            else:
                write_output({"error": f"Unknown command: {cmd}"})

        except json.JSONDecodeError as e:
            write_output({"error": f"JSON parse error: {str(e)}"})
        except Exception as e:
            write_output({"error": f"Runtime error: {str(e)}"})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", required=True, choices=["check", "analyze", "run"])
    parser.add_argument("--weights", required=False, help="Path to .pth weights", default="weights.pth")
    parser.add_argument("--device", default=None, help="cuda or cpu")
    args = parser.parse_args()

    if args.mode != "check":
        init_info = init_module(args.weights, args.device)
        if args.mode == "run":
            _persistent_loop()
            return

    data = read_input()

    if args.mode == "check":
        if _model is None:
            init_module(args.weights, args.device)
        write_output(check())

    elif args.mode == "analyze":
        image_path = data.get("image_path")
        if not image_path:
            write_output({"error": "image_path required"})
            return

        try:
            with Image.open(image_path) as img:
                orig_size = img.size
        except:
            orig_size = None

        result = analyze(image_path, return_pixels=True, original_size=orig_size)
        write_output(result)


if __name__ == "__main__":
    main()