#!/usr/bin/env bash
# Catálogo de labels del repositorio. Fuente única de verdad.
#
# Uso:
#   GH_TOKEN=... bash .github/labels.sh
#
# Es idempotente: `gh label create --force` actualiza el label si ya existe
# en vez de fallar, así que puede ejecutarse en cada run del workflow.
set -euo pipefail

# nombre|color|descripción
LABELS=(
  "tipo:bug|d73a4a|Algo no funciona como debería"
  "tipo:feature|a2eeef|Funcionalidad nueva"
  "tipo:docs|0075ca|README, CLAUDE.md o comentarios"
  "tipo:refactor|cfd3d7|Reestructuración sin cambio de comportamiento"

  "area:gameplay|5319e7|Lógica de juego: colisión, rotación, drop, scoring"
  "area:render|1d76db|Dibujado en canvas: draw, drawGrid, drawNext, ghost"
  "area:ui|fbca04|HUD, overlay, controles, estilos"
  "area:build|bfd4f2|Workflows, tooling, repositorio"

  "prioridad:alta|b60205|Rompe el juego o bloquea"
  "prioridad:media|fbca04|Importante, no bloqueante"
  "prioridad:baja|0e8a16|Mejora menor o cosmética"

  "complejidad:baja|c2e0c6|Cambio localizado, pocas líneas"
  "complejidad:media|fef2c0|Toca varias funciones"
  "complejidad:alta|f9d0c4|Afecta invariantes o varios archivos"
)

for entry in "${LABELS[@]}"; do
  IFS='|' read -r name color desc <<< "$entry"
  gh label create "$name" --color "$color" --description "$desc" --force
done

echo "Sincronizados ${#LABELS[@]} labels."
