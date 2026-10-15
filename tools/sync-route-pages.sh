#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

find "$project_dir" -name index.html \
  -not -path "$project_dir/index.html" \
  -not -path "$project_dir/motf-prototype/*" \
  -exec cp "$project_dir/index.html" {} \;

echo "Route page copies now match the canonical index.html."
