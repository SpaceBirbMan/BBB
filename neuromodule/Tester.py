import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import subprocess
import json
import sys
import os
import threading
import queue
import time
from PIL import Image, ImageTk
import pydicom
import numpy as np
from pathlib import Path


class TesterApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Module Tester")
        self.root.geometry("1400x900")
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

        self.normalizer = None
        self.orchestrator = None
        self.response_queue = queue.Queue()
        self.running = True

        # Флаги готовности
        self.norm_ready = False
        self.orch_ready = False

        self.original_image = None
        self.original_path = None
        self.cache_id = None
        self.points = []

        self.crop_center_x = tk.IntVar(value=256)
        self.crop_center_y = tk.IntVar(value=256)
        self.crop_size = tk.IntVar(value=512)

        self.setup_ui()
        # Запускаем модули через 100мс после отрисовки
        self.root.after(100, self.start_modules)
        self.root.after(100, self.process_responses)

    def setup_ui(self):
        left_panel = ttk.Frame(self.root, padding=10)
        left_panel.pack(side=tk.LEFT, fill=tk.Y)

        btn_frame = ttk.Frame(left_panel)
        btn_frame.pack(fill=tk.X, pady=5)
        ttk.Button(btn_frame, text="Загрузить DICOM", command=self.load_dicom).pack(fill=tk.X, pady=2)
        ttk.Button(btn_frame, text="Загрузить PNG", command=self.load_image).pack(fill=tk.X, pady=2)
        ttk.Button(btn_frame, text="АНАЛИЗ", command=self.run_analysis).pack(fill=tk.X, pady=10)
        ttk.Button(btn_frame, text="Очистить точки", command=self.clear_points).pack(fill=tk.X, pady=2)
        ttk.Button(btn_frame, text="СТОП МОДУЛИ", command=self.stop_modules).pack(fill=tk.X, pady=2)

        ttk.Separator(left_panel, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=15)

        ttk.Label(left_panel, text="Настройки кропа", font=('Arial', 10, 'bold')).pack(anchor=tk.W)

        # Слайдеры
        for label_text, var, lbl_attr in [
            ("Центр X:", self.crop_center_x, "lbl_x"),
            ("Центр Y:", self.crop_center_y, "lbl_y"),
            ("Размер:", self.crop_size, "lbl_size")
        ]:
            ttk.Label(left_panel, text=label_text).pack(anchor=tk.W)
            slider = ttk.Scale(left_panel, from_=0, to=2048 if "Центр" in label_text else 1024,
                               variable=var, orient=tk.HORIZONTAL)
            slider.pack(fill=tk.X, pady=2)
            lbl = ttk.Label(left_panel, text="0")
            lbl.pack()
            setattr(self, lbl_attr, lbl)
            var.trace('w', lambda *a, v=var, l=lbl: l.config(text=str(v.get())))

        self.lbl_x.config(text="256")
        self.lbl_y.config(text="256")
        self.lbl_size.config(text="512")

        ttk.Separator(left_panel, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=15)

        self.status_lbl = ttk.Label(left_panel, text="Статус: Запуск...", foreground="orange")
        self.status_lbl.pack(anchor=tk.W)

        self.log_text = tk.Text(left_panel, height=25, width=45)
        self.log_text.pack(fill=tk.BOTH, expand=True, pady=5)

        right_panel = ttk.Frame(self.root, padding=10)
        right_panel.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)
        self.canvas = tk.Canvas(right_panel, bg="#222")
        self.canvas.pack(fill=tk.BOTH, expand=True)

    def log(self, msg):
        self.log_text.insert(tk.END, f"{msg}\n")
        self.log_text.see(tk.END)
        self.root.update_idletasks()

    def set_status(self, msg, color="black"):
        self.status_lbl.config(text=f"Статус: {msg}", foreground=color)

    def start_modules(self):
        if not self.running: return

        base_dir = Path(__file__).parent.resolve()

        # Поиск файлов (case-insensitive)
        normalizer_path = None
        orchestrator_path = None

        for f in base_dir.iterdir():
            name_low = f.name.lower()
            if name_low == "normalizer.py": normalizer_path = f
            if name_low == "analyzer.py": orchestrator_path = f

        modules_dir = base_dir / "submodules"

        if not normalizer_path:
            self.log(f"✗ ОШИБКА: Normalizer.py не найден в {base_dir}")
            self.set_status("Файл не найден", "red")
            return
        if not orchestrator_path:
            self.log(f"✗ ОШИБКА: Analyzer.py не найден в {base_dir}")
            self.set_status("Файл не найден", "red")
            return

        if not modules_dir.exists():
            self.log(f"! Создаю папку submodules...")
            modules_dir.mkdir()

        try:
            self.log("→ Запуск нормализатора...")
            # -u отключает буферизацию stdout/stderr
            self.normalizer = subprocess.Popen(
                [sys.executable, "-u", str(normalizer_path)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            )

            self.log("→ Запуск оркестратора...")
            self.orchestrator = subprocess.Popen(
                [sys.executable, "-u", str(orchestrator_path), "--modules-dir", str(modules_dir)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            )

            # Запускаем потоки чтения НЕМЕДЛЕННО
            threading.Thread(target=self._read_stream, args=(self.normalizer.stdout, "NORM"), daemon=True).start()
            threading.Thread(target=self._read_stream, args=(self.normalizer.stderr, "NORM_ERR"), daemon=True).start()
            threading.Thread(target=self._read_stream, args=(self.orchestrator.stdout, "ORCH"), daemon=True).start()
            threading.Thread(target=self._read_stream, args=(self.orchestrator.stderr, "ORCH_ERR"), daemon=True).start()

            # Ждем готовности в фоне, не блокируя UI
            threading.Thread(target=self._wait_for_start_thread, daemon=True).start()

        except Exception as e:
            self.log(f"✗ Критическая ошибка запуска: {e}")
            self.set_status("Краш", "red")

    def _read_stream(self, stream, prefix):
        """Читает поток и кладет данные в очередь"""
        try:
            for line in stream:
                if not self.running: break
                line = line.strip()
                if not line: continue

                # Пробуем распарсить JSON
                try:
                    data = json.loads(line)
                    self.response_queue.put((prefix, data))
                except json.JSONDecodeError:
                    # Если не JSON - это лог ошибки Python или print
                    # Пишем сразу в лог, чтобы видеть падения
                    self.log(f"[{prefix}] {line}")
        except Exception as e:
            if self.running:
                self.log(f"[{prefix}] Поток закрыт: {e}")

    def _wait_for_start_thread(self):
        """Ждет флагов готовности в отдельном потоке"""
        start_time = time.time()
        timeout = 10.0

        while time.time() - start_time < timeout:
            if not self.running: break

            # Проверяем очередь
            temp_items = []
            while not self.response_queue.empty():
                src, data = self.response_queue.get()
                status = data.get("status", "")

                if status == "normalizer_ready":
                    self.norm_ready = True
                    self.log("✓ Нормализатор готов")
                elif status == "orchestrator_ready":
                    self.orch_ready = True
                    self.log("✓ Оркестратор готов")
                else:
                    # Возвращаем остальные сообщения в очередь
                    temp_items.append((src, data))

            # Возвращаем обратно
            for item in temp_items:
                self.response_queue.put(item)

            if self.norm_ready and self.orch_ready:
                self.root.after(0, lambda: self.set_status("Система активна", "green"))
                self.root.after(0, lambda: self.log("✓ Система готова к работе"))
                self.send_to_orchestrator({"cmd": "configure", "execution_mode": "parallel"})
                return

            # Проверка на смерть процесса
            if self.orchestrator and self.orchestrator.poll() is not None:
                self.root.after(0, lambda: self.log("✗ Оркестратор упал сразу при старте! См. логи выше."))
                self.root.after(0, lambda: self.set_status("Оркестратор упал", "red"))
                break

            if self.normalizer and self.normalizer.poll() is not None:
                self.root.after(0, lambda: self.log("✗ Нормализатор упал сразу при старте!"))
                break

            time.sleep(0.2)

        if not (self.norm_ready and self.orch_ready) and self.running:
            self.root.after(0, lambda: self.set_status("Таймаут запуска", "red"))
            if not self.orch_ready:
                self.root.after(0, lambda: self.log("✗ Оркестратор не ответил за 10 сек. Проверьте логи [ORCH_ERR]"))

    def send_to_normalizer(self, data):
        if self.normalizer and self.normalizer.poll() is None:
            try:
                self.normalizer.stdin.write(json.dumps(data, ensure_ascii=False) + "\n")
                self.normalizer.stdin.flush()
            except BrokenPipeError:
                self.log("✗ Ошибка: Нормализатор недоступен")
                self.normalizer = None

    def send_to_orchestrator(self, data):
        if self.orchestrator and self.orchestrator.poll() is None:
            try:
                self.orchestrator.stdin.write(json.dumps(data, ensure_ascii=False) + "\n")
                self.orchestrator.stdin.flush()
            except BrokenPipeError:
                self.log("✗ Ошибка: Оркестратор недоступен")
                self.orchestrator = None

    def process_responses(self):
        if not self.running: return

        while not self.response_queue.empty():
            src, data = self.response_queue.get()

            if "error" in data:
                self.log(f"✗ [{src}] {data['error']}")
                continue

            if src.startswith("NORM"):
                if data.get("status") == "normalized":
                    self.cache_id = data.get("cache_id")
                    path = data.get("normalized_image")
                    self.log(f"→ Нормализация: {path}")
                    self.send_to_orchestrator({"cmd": "analyze", "image_path": path})

                elif data.get("coords"):
                    self.points = data["coords"]
                    self.draw_points()
                    self.set_status("Готово", "green")
                    self.log(f"✓ Точек найдено: {len(self.points)}")

            elif src.startswith("ORCH"):
                if data.get("coords"):
                    self.log("→ Анализ завершен, конвертация...")
                    self.send_to_normalizer({
                        "cmd": "convert_coords",
                        "coords": data["coords"],
                        "cache_id": self.cache_id
                    })
                elif data.get("warning"):
                    self.log(f"⚠ {data['warning']}")

        self.root.after(100, self.process_responses)

    def load_dicom(self):
        path = filedialog.askopenfilename(filetypes=[("DICOM", "*.dcm *.DCM"), ("All", "*.*")])
        if not path: return
        try:
            ds = pydicom.dcmread(path)
            arr = ds.pixel_array
            if arr.dtype != np.uint8:
                arr = ((arr - arr.min()) / (arr.max() - arr.min()) * 255).astype(np.uint8)

            img = Image.fromarray(arr, mode='L') if len(arr.shape) == 2 else Image.fromarray(arr)
            self.original_path = f"temp_{Path(path).stem}.png"
            img.save(self.original_path)
            self.original_image = img

            w, h = img.size
            self.crop_center_x.set(w // 2)
            self.crop_center_y.set(h // 2)
            self.crop_size.set(min(w, h))

            self.display_image(img)
            self.log(f"✓ DICOM: {w}x{h}")
        except Exception as e:
            messagebox.showerror("Ошибка DICOM", str(e))
            self.log(f"✗ {e}")

    def load_image(self):
        path = filedialog.askopenfilename(filetypes=[("Images", "*.png *.jpg *.jpeg"), ("All", "*.*")])
        if not path: return
        try:
            img = Image.open(path).convert("RGB")
            self.original_image = img
            self.original_path = path

            w, h = img.size
            self.crop_center_x.set(w // 2)
            self.crop_center_y.set(h // 2)
            self.crop_size.set(min(w, h))

            self.display_image(img)
            self.log(f"✓ IMG: {w}x{h}")
        except Exception as e:
            messagebox.showerror("Ошибка", str(e))

    def display_image(self, img, points=None):
        self.canvas.delete("all")
        cw = self.canvas.winfo_width()
        ch = self.canvas.winfo_height()
        if cw < 10: cw = 800
        if ch < 10: ch = 600

        scale = min(cw / img.width, ch / img.height)
        nw, nh = int(img.width * scale), int(img.height * scale)
        img_r = img.resize((nw, nh), Image.LANCZOS)
        self.photo = ImageTk.PhotoImage(img_r)

        x0, y0 = (cw - nw) // 2, (ch - nh) // 2
        self.canvas.create_image(x0, y0, anchor=tk.NW, image=self.photo)

        cx, cy, sz = self.crop_center_x.get(), self.crop_center_y.get(), self.crop_size.get()
        x1 = (cx - sz // 2) * scale + x0
        y1 = (cy - sz // 2) * scale + y0
        x2 = (cx + sz // 2) * scale + x0
        y2 = (cy + sz // 2) * scale + y0
        self.canvas.create_rectangle(x1, y1, x2, y2, outline="#0f0", width=2, dash=(4, 4))

        if points:
            for p in points:
                px = p["x"] * scale + x0
                py = p["y"] * scale + y0
                self.canvas.create_oval(px - 5, py - 5, px + 5, py + 5, fill="red", outline="white")

    def run_analysis(self):
        if not self.original_path:
            messagebox.showwarning("Внимание", "Загрузите изображение!")
            return
        if not (self.norm_ready and self.orch_ready):
            messagebox.showwarning("Внимание", "Модули не готовы! Проверьте логи.")
            return

        self.set_status("Обработка...", "orange")
        self.log("→ Запуск анализа...")

        cx, cy, sz = self.crop_center_x.get(), self.crop_center_y.get(), self.crop_size.get()
        x = max(0, cx - sz // 2)
        y = max(0, cy - sz // 2)

        self.send_to_normalizer({
            "cmd": "normalize",
            "image_path": self.original_path,
            "custom_crop": [x, y, sz, sz]
        })

    def clear_points(self):
        self.points = []
        if self.original_image: self.display_image(self.original_image)
        self.log("Точки очищены")

    def draw_points(self):
        if self.original_image: self.display_image(self.original_image, self.points)

    def stop_modules(self):
        self.log("→ Остановка модулей...")
        self.running = False

        for name, proc in [("Norm", self.normalizer), ("Orch", self.orchestrator)]:
            if proc and proc.poll() is None:
                try:
                    proc.stdin.write('{"cmd": "stop"}\n')
                    proc.stdin.flush()
                    time.sleep(0.2)
                    proc.terminate()
                    proc.wait(timeout=2)
                except:
                    proc.kill()

        self.set_status("Остановлено", "gray")
        self.log("✓ Все процессы завершены")

    def on_closing(self):
        self.stop_modules()
        self.root.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    app = TesterApp(root)
    root.mainloop()