// electron-builder publica el .exe y el .blockmap con dos publishers en
// paralelo; si el release del tag no existe, cada uno crea el suyo y quedan
// dos releases con el mismo tag (pasó con v1.2.1: latest.yml quedaba en 404
// para el auto-update). Creándolo antes, ambos lo encuentran y suben ahí.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const { owner, repo } = pkg.build.publish;
const tag = `v${pkg.version}`;
const token = process.env.GH_TOKEN;

const api = (ruta, opts = {}) =>
  fetch(`https://api.github.com/repos/${owner}/${repo}${ruta}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      ...opts.headers,
    },
  });

// process.exit() justo después de un fetch revienta en Windows (aserción de
// libuv en async.c); por eso se devuelve el error y se usa process.exitCode.
async function main() {
  if (!token) return "Falta GH_TOKEN en el entorno.";

  const existentes = await (await api("/releases?per_page=100")).json();
  const delTag = existentes.filter((r) => r.tag_name === tag);

  if (delTag.length > 1) return `Ya hay ${delTag.length} releases con el tag ${tag}; deja uno solo antes de publicar.`;
  if (delTag.length === 1) {
    console.log(`Release ${tag} ya existe (id ${delTag[0].id}).`);
    return null;
  }

  const res = await api("/releases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag_name: tag, name: pkg.version, draft: false, prerelease: false }),
  });
  if (!res.ok) return `No se pudo crear el release ${tag}: ${res.status} ${await res.text()}`;
  console.log(`Release ${tag} creado (id ${(await res.json()).id}).`);
  return null;
}

const error = await main();
if (error) {
  console.error(error);
  process.exitCode = 1;
}
