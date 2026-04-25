#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Sales Engine Step 01

功能：
读取手动导出的 CRM 录音 CSV，生成标准化录音入口表。

输入：
sales-engine/data/input/call_voice_export_*.csv

输出：
sales-engine/data/output/recording_links_import.csv

执行位置：
阿里云服务器，仓库根目录

执行命令：
python3 sales-engine/scripts/01_import_crm_voice_csv.py
"""

import os
import re
import sys
import glob
import hashlib
from pathlib import Path
from datetime import datetime

import pandas as pd
from dotenv import load_dotenv


REQUIRED_COLUMNS = [
    "user_id",
    "sales_name",
    "group_name",
    "call_time",
    "call_status",
    "voice_id",
    "play_url",
    "down_url",
]


OUTPUT_COLUMNS = [
    "recording_key",
    "voice_id",
    "user_id",
    "sales_name",
    "group_name",
    "call_time",
    "call_status",
    "play_url",
    "down_url",
    "source_file",
    "source_row_no",
    "has_audio_url",
    "import_status",
    "import_error",
    "transcript_status",
    "analysis_status",
    "created_at",
    "updated_at",
]


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def clean_text(value) -> str:
    if pd.isna(value):
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def normalize_call_time(value: str) -> str:
    value = clean_text(value)
    if not value:
        return ""

    dt = pd.to_datetime(value, errors="coerce")
    if pd.isna(dt):
        return value

    return dt.strftime("%Y-%m-%d %H:%M:%S")


def make_recording_key(row: dict) -> str:
    voice_id = clean_text(row.get("voice_id", ""))
    if voice_id:
        return f"voice_{voice_id}"

    raw = "__".join(
        [
            clean_text(row.get("user_id", "")),
            clean_text(row.get("sales_name", "")),
            clean_text(row.get("call_time", "")),
        ]
    )
    digest = hashlib.md5(raw.encode("utf-8")).hexdigest()[:12]
    return f"fallback_{digest}"


def find_latest_input_csv(input_dir: str) -> str:
    pattern = os.path.join(input_dir, "call_voice_export_*.csv")
    files = glob.glob(pattern)

    if not files:
        raise FileNotFoundError(
            f"No CSV found in {input_dir}. "
            f"Please upload call_voice_export_*.csv first."
        )

    files = sorted(files, key=lambda p: os.path.getmtime(p), reverse=True)
    return files[0]


def read_csv_safely(path: str) -> pd.DataFrame:
    try:
        return pd.read_csv(path, dtype=str, encoding="utf-8-sig").fillna("")
    except UnicodeDecodeError:
        return pd.read_csv(path, dtype=str, encoding="utf-8").fillna("")


def validate_columns(df: pd.DataFrame) -> None:
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(
            "Input CSV missing required columns: "
            + ", ".join(missing)
            + f"\nCurrent columns: {list(df.columns)}"
        )


def build_import_table(df: pd.DataFrame, source_file: str) -> pd.DataFrame:
    rows = []
    created_at = now_str()
    source_name = Path(source_file).name

    for idx, src in df.iterrows():
        row = {
            "voice_id": clean_text(src.get("voice_id", "")),
            "user_id": clean_text(src.get("user_id", "")),
            "sales_name": clean_text(src.get("sales_name", "")),
            "group_name": clean_text(src.get("group_name", "")),
            "call_time": normalize_call_time(src.get("call_time", "")),
            "call_status": clean_text(src.get("call_status", "")),
            "play_url": clean_text(src.get("play_url", "")),
            "down_url": clean_text(src.get("down_url", "")),
        }

        row["recording_key"] = make_recording_key(row)
        row["source_file"] = source_name
        row["source_row_no"] = str(idx + 2)
        row["has_audio_url"] = "yes" if row["down_url"] else "no"

        errors = []
        if not row["user_id"]:
            errors.append("missing_user_id")
        if not row["voice_id"]:
            errors.append("missing_voice_id")
        if not row["down_url"]:
            errors.append("missing_down_url")

        row["import_status"] = "success" if not errors else "skipped"
        row["import_error"] = ";".join(errors)
        row["transcript_status"] = "pending" if row["import_status"] == "success" else "skipped"
        row["analysis_status"] = "pending" if row["import_status"] == "success" else "skipped"
        row["created_at"] = created_at
        row["updated_at"] = created_at

        rows.append(row)

    out = pd.DataFrame(rows)
    out = out.sort_values(by=["recording_key", "call_time"], ascending=[True, False])
    out = out.drop_duplicates(subset=["recording_key"], keep="first")

    return out[OUTPUT_COLUMNS]


def merge_with_existing(new_df: pd.DataFrame, output_path: str) -> pd.DataFrame:
    if not os.path.exists(output_path):
        return new_df

    old_df = pd.read_csv(output_path, dtype=str, encoding="utf-8-sig").fillna("")

    for col in OUTPUT_COLUMNS:
        if col not in old_df.columns:
            old_df[col] = ""

    old_df = old_df[OUTPUT_COLUMNS]

    old_keys = set(old_df["recording_key"].astype(str))
    append_df = new_df[~new_df["recording_key"].astype(str).isin(old_keys)].copy()

    if append_df.empty:
        return old_df

    final_df = pd.concat([old_df, append_df], ignore_index=True)
    return final_df[OUTPUT_COLUMNS]


def main() -> None:
    load_dotenv()

    repo_root = Path(__file__).resolve().parents[2]

    input_dir = os.getenv(
        "SALES_ENGINE_INPUT_DIR",
        str(repo_root / "sales-engine" / "data" / "input"),
    )
    output_dir = os.getenv(
        "SALES_ENGINE_OUTPUT_DIR",
        str(repo_root / "sales-engine" / "data" / "output"),
    )

    os.makedirs(input_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)

    input_csv = find_latest_input_csv(input_dir)
    output_path = os.path.join(output_dir, "recording_links_import.csv")

    print("===== Sales Engine Step 01: Import CRM Voice CSV =====")
    print(f"Input CSV: {input_csv}")
    print(f"Output CSV: {output_path}")

    df = read_csv_safely(input_csv)
    validate_columns(df)

    new_table = build_import_table(df, input_csv)
    final_table = merge_with_existing(new_table, output_path)

    final_table.to_csv(output_path, index=False, encoding="utf-8-sig")

    print("===== RESULT =====")
    print(f"Input rows: {len(df)}")
    print(f"Normalized rows: {len(new_table)}")
    print(f"Final rows: {len(final_table)}")
    print(f"Pending transcript: {len(final_table[final_table['transcript_status'] == 'pending'])}")
    print("Done.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
