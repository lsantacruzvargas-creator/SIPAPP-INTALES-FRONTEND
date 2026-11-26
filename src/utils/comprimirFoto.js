// Fotos de celular de 10-20 MB superan el tope de multer (15-20 MB) y la subida
// falla. Se reducen en el navegador a 2000 px de lado mayor en JPEG; si algo
// falla o no achica, se sube la original. GIF/SVG/PDF y demás pasan intactos.
const LADO_MAX_FOTO = 2000;
const TIPOS_COMPRIMIBLES = ["image/jpeg", "image/png", "image/webp"];

export async function comprimirFoto(file) {
  if (!TIPOS_COMPRIMIBLES.includes(file.type) || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, LADO_MAX_FOTO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export const mensajeSubida = async (res) => {
  const data = await res.json().catch(() => null);
  return data?.mensaje || data?.error || "formato o tamaño no permitido";
};
