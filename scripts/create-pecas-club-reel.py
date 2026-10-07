import math
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

WIDTH, HEIGHT, FPS = 720, 1280, 24
SECONDS_PER_SCENE = 4
BG = "#fff8ec"
BURGUNDY = "#920426"
BROWN = "#4b2918"
MUTED = "#846b5a"
GOLD = "#f2a900"
ORANGE = "#ff4d18"
ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "marketing"
OUT = OUT_DIR / "pecas-club-reel.mp4"
LOGO = ROOT / "public" / "tenants" / "pecas" / "pecas-logo.svg"
HERO = Path(r"C:\Users\LENOVO\Downloads\Únete a Pecas Club.png")
PRODUCT = ROOT / "public" / "tenants" / "pecas" / "products" / "crepa.webp"


def font(size, serif=False, bold=False):
    if serif:
        path = r"C:\Windows\Fonts\georgiab.ttf" if bold else r"C:\Windows\Fonts\georgia.ttf"
    else:
        path = r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf"
    return ImageFont.truetype(path, size)


def ease(value):
    value = max(0.0, min(1.0, value))
    return 1 - (1 - value) ** 3


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def center_text(draw, y, text, face, color, width=WIDTH - 80):
    lines = []
    words = text.split()
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textbbox((0, 0), trial, font=face)[2] <= width:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    for line in lines:
        box = draw.textbbox((0, 0), line, font=face)
        draw.text(((WIDTH - (box[2] - box[0])) / 2, y), line, font=face, fill=color)
        y += int(face.size * 1.16)
    return y


def dots(draw, offset=0):
    for x, y, r, color in [(80, 118, 18, GOLD), (126, 89, 11, ORANGE), (654, 172, 20, BROWN), (612, 1090, 15, GOLD)]:
        draw.ellipse((x-r+offset, y-r, x+r+offset, y+r), fill=color)


def phone_shell(canvas, top=300):
    draw = ImageDraw.Draw(canvas)
    left, right, bottom = 115, 605, top + 760
    rounded(draw, (left, top, right, bottom), 46, "#2c211c")
    rounded(draw, (left + 12, top + 12, right - 12, bottom - 12), 38, "#fffdf8")
    rounded(draw, (286, top + 20, 434, top + 40), 10, "#2c211c")
    return (left + 28, top + 62, right - 28, bottom - 28)


def scene_login(progress):
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)
    dots(draw, int(10 * math.sin(progress * math.pi)))
    center_text(draw, 72, "Entra a Pecas Club", font(48, serif=True, bold=True), BURGUNDY)
    center_text(draw, 142, "Tu cuenta y tus recompensas, en un solo lugar", font(23), MUTED)
    x1, y1, x2, y2 = phone_shell(img, 250 + int(28 * (1-ease(progress))))
    draw = ImageDraw.Draw(img)
    draw.text((x1+24, y1+28), "PECAS CLUB", font=font(20, bold=True), fill=BURGUNDY)
    draw.text((x1+24, y1+82), "Bienvenido", font=font(42, serif=True, bold=True), fill=BROWN)
    draw.text((x1+24, y1+145), "Número de celular", font=font(19, bold=True), fill=MUTED)
    rounded(draw, (x1+24, y1+178, x2-24, y1+238), 16, "#f5ead9", "#dfc8aa")
    draw.text((x1+45, y1+194), "811 799 8493", font=font(23), fill=BROWN)
    draw.text((x1+24, y1+273), "PIN de 6 dígitos", font=font(19, bold=True), fill=MUTED)
    rounded(draw, (x1+24, y1+306, x2-24, y1+366), 16, "#f5ead9", "#dfc8aa")
    draw.text((x1+45, y1+321), "••••••", font=font(27, bold=True), fill=BROWN)
    rounded(draw, (x1+24, y1+410, x2-24, y1+478), 30, BURGUNDY)
    label = "Ingresar"
    box = draw.textbbox((0, 0), label, font=font(25, bold=True))
    draw.text(((WIDTH-(box[2]-box[0]))/2, y1+426), label, font=font(25, bold=True), fill="white")
    return img


def scene_balance(progress):
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)
    dots(draw)
    center_text(draw, 68, "Tus Pecas crecen contigo", font(45, serif=True, bold=True), BURGUNDY)
    x1, y1, x2, y2 = phone_shell(img, 235)
    draw = ImageDraw.Draw(img)
    draw.text((x1+24, y1+24), "Hola, Oto", font=font(30, serif=True, bold=True), fill=BROWN)
    rounded(draw, (x1+20, y1+86, x2-20, y1+260), 24, "#fff2cf", "#f0d18b", 2)
    draw.text((x1+46, y1+112), "Tienes", font=font(21), fill=MUTED)
    count = max(0, min(12, round(12 * ease(progress * 1.4))))
    draw.text((x1+44, y1+148), f"{count} Pecas ●", font=font(44, serif=True, bold=True), fill=BURGUNDY)
    draw.text((x1+24, y1+302), "Te faltan 3 Pecas para tu", font=font(20), fill=MUTED)
    draw.text((x1+24, y1+331), "siguiente recompensa.", font=font(20, bold=True), fill=BROWN)
    rounded(draw, (x1+20, y1+390, x2-20, y1+535), 22, "#f8eee3")
    draw.text((x1+42, y1+416), "Próxima recompensa", font=font(18, bold=True), fill=BURGUNDY)
    draw.text((x1+42, y1+458), "Crepa clásica gratis", font=font(25, bold=True), fill=BROWN)
    draw.text((x1+42, y1+496), "15 Pecas", font=font(20), fill=MUTED)
    center_text(draw, 1070, "1 Peca por cada $20", font(31, bold=True), BURGUNDY)
    return img


def scene_promo(progress):
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)
    center_text(draw, 70, "Promociones exclusivas", font(48, serif=True, bold=True), BURGUNDY)
    center_text(draw, 140, "Solo para miembros de Pecas Club", font(24), MUTED)
    card_y = 265 + int(25 * (1-ease(progress)))
    rounded(draw, (62, card_y, 658, card_y+720), 34, "#ffffff", "#ead9c7", 2)
    product = Image.open(PRODUCT).convert("RGB")
    scale = max(520/product.width, 315/product.height)
    product = product.resize((int(product.width*scale), int(product.height*scale)))
    left = (product.width-520)//2
    top = (product.height-315)//2
    product = product.crop((left, top, left+520, top+315))
    product = ImageEnhance.Color(product).enhance(.95)
    mask = Image.new("L", product.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 520, 315), radius=24, fill=255)
    img.paste(product, (100, card_y+34), mask)
    draw = ImageDraw.Draw(img)
    rounded(draw, (100, card_y+375, 300, card_y+415), 18, "#f8e7eb")
    draw.text((121, card_y+383), "SOLO PECAS CLUB", font=font(16, bold=True), fill=BURGUNDY)
    draw.text((100, card_y+450), "Crepa + Latte", font=font(37, serif=True, bold=True), fill=BROWN)
    draw.text((100, card_y+512), "Una combinación especial", font=font(22), fill=MUTED)
    draw.text((100, card_y+545), "para consentirte.", font=font(22), fill=MUTED)
    draw.text((100, card_y+606), "$129", font=font(36, bold=True), fill=BURGUNDY)
    rounded(draw, (340, card_y+594, 615, card_y+658), 28, BURGUNDY)
    draw.text((384, card_y+611), "Agregar promo", font=font(21, bold=True), fill="white")
    return img


def scene_cta(progress):
    hero = Image.open(HERO).convert("RGB")
    scale = max(WIDTH/hero.width, HEIGHT/hero.height)
    hero = hero.resize((int(hero.width*scale), int(hero.height*scale)))
    left = (hero.width-WIDTH)//2
    top = (hero.height-HEIGHT)//2
    hero = hero.crop((left, top, left+WIDTH, top+HEIGHT)).filter(ImageFilter.GaussianBlur(1.0))
    veil = Image.new("RGBA", hero.size, (255, 248, 236, 65))
    img = Image.alpha_composite(hero.convert("RGBA"), veil).convert("RGB")
    draw = ImageDraw.Draw(img)
    rounded(draw, (48, 300, 672, 1010), 42, (255, 253, 247), "#ead5b9", 2)
    center_text(draw, 378, "Únete a", font(64, serif=True, bold=True), BURGUNDY, 570)
    center_text(draw, 455, "Pecas Club", font(72, serif=True, bold=True), BURGUNDY, 590)
    center_text(draw, 575, "Acumula Pecas y canjéalas", font(28), BROWN, 560)
    center_text(draw, 614, "por tus favoritos.", font(28), BROWN, 560)
    rounded(draw, (120, 730, 600, 812), 40, BURGUNDY)
    button = "Regístrate gratis"
    b = draw.textbbox((0, 0), button, font=font(29, serif=True, bold=True))
    draw.text(((WIDTH-(b[2]-b[0]))/2, 749), button, font=font(29, serif=True, bold=True), fill="white")
    center_text(draw, 865, "pecas.mx/club/registro", font(24, bold=True), BURGUNDY)
    return img


def main():
    dep_dir = Path(os.environ.get("PECAS_VIDEO_DEPS", Path(os.environ["TEMP"]) / "pecas-video-deps"))
    sys.path.insert(0, str(dep_dir))
    import imageio_ffmpeg

    OUT_DIR.mkdir(exist_ok=True)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ffmpeg, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(OUT)]
    process = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    scenes = [scene_login, scene_balance, scene_promo, scene_cta]
    frames_per_scene = FPS * SECONDS_PER_SCENE
    for scene in scenes:
        for frame_no in range(frames_per_scene):
            progress = frame_no / max(1, frames_per_scene - 1)
            frame = scene(progress)
            fade = min(1, frame_no / 8, (frames_per_scene - 1 - frame_no) / 8)
            if fade < 1:
                overlay = Image.new("RGB", frame.size, BG)
                frame = Image.blend(overlay, frame, max(0, fade))
            process.stdin.write(frame.tobytes())
    process.stdin.close()
    if process.wait() != 0:
        raise SystemExit("No se pudo generar el video")
    print(OUT)


if __name__ == "__main__":
    main()
