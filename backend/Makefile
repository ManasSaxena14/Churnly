.PHONY: dev fastapi inngest install build start

# Default shell
SHELL := /bin/bash

# Configuration
PYTHON_VENV := .venv
PYTHON_BIN := $(PYTHON_VENV)/bin/python
UVICORN_BIN := $(PYTHON_VENV)/bin/uvicorn
APP_MODULE := app.main:app
PORT ?= 8000
INNGEST_URL := http://127.0.0.1:$(PORT)/api/inngest
ONNX_CACHE_DIR := app/rag/onnx_cache

# Symlink $HOME/.cache/chroma to a project-dir cache BEFORE ingest runs, so the
# ONNX model Chroma downloads on first use lands inside /opt/render/project/src
# (which Render preserves to runtime) instead of $HOME/.cache (ephemeral). This
# avoids re-downloading the 80MB model at runtime, which OOM-kills the 512MB
# free tier.
install:
	python3 -m venv $(PYTHON_VENV)
	$(PYTHON_VENV)/bin/pip install -r requirements-dev.txt
	mkdir -p $(ONNX_CACHE_DIR)
	mkdir -p $$HOME/.cache
	rm -rf $$HOME/.cache/chroma
	ln -sfn $(abspath $(ONNX_CACHE_DIR)) $$HOME/.cache/chroma
	$(PYTHON_BIN) -m app.rag.ingest
	@echo "[install] onnx cache contents:" && ls -lah $(ONNX_CACHE_DIR) || true

build: install

fastapi:
	$(UVICORN_BIN) $(APP_MODULE) --reload --port $(PORT)

start:
	$(UVICORN_BIN) $(APP_MODULE) --host 0.0.0.0 --port $(PORT)

inngest:
	npx inngest-cli@latest dev -u $(INNGEST_URL)

dev:
	@echo "Starting FastAPI and Inngest Dev Server..."
	@npx concurrently -n "FastAPI,Inngest" -c "cyan,magenta" \
		"$(UVICORN_BIN) $(APP_MODULE) --reload --port $(PORT)" \
		"npx inngest-cli@latest dev -u $(INNGEST_URL)"

# ── Quality ──────────────────────────────────────────────────────────
.PHONY: test eval eval-full demo-list demo-promote

test:
	$(PYTHON_BIN) -m pytest -q

# Free: deterministic stats layer vs planted drivers, BH vs raw ablation
eval:
	$(PYTHON_BIN) -m evals.run_evals --n 50

# Needs API keys: whole pipeline, z-gate ablation
eval-full:
	$(PYTHON_BIN) -m evals.run_evals --mode full --n 3 --ablate

demo-list:
	$(PYTHON_BIN) -m app.runs list

# usage: make demo-promote JOB=<job_id>
demo-promote:
	$(PYTHON_BIN) -m app.runs promote $(JOB)
