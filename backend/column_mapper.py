"""Read any CSV / Excel table and map its columns to the fields the analytics need.

The platform works with six fields:

    date (required), sales (required), product, region, cost, units

A user's file can have any column names (English or Greek), any order, extra
columns, European number formats ("1.234,56"), Excel dates, a title row above
the header, and so on.  This module

  1. reads the file                              -> read_table()
  2. guesses which column is which               -> suggest_mapping()
  3. describes the columns for a preview screen  -> describe_columns()
  4. turns the file into the standard 6 columns  -> apply_mapping()

It only depends on pandas, so it can be tested without the web server.
"""

from __future__ import annotations

import csv
import re
import unicodedata
from io import BytesIO, StringIO

import pandas as pd

FIELDS = ["date", "sales", "product", "region", "cost", "units", "profit"]
REQUIRED = ["date", "sales"]
STANDARD_COLUMNS = ["date", "product", "region", "sales", "cost", "units"]

FIELD_LABELS = {
    "date": "Date",
    "sales": "Sales / revenue",
    "product": "Category / product",
    "region": "Group / region",
    "cost": "Cost",
    "units": "Units / quantity",
    "profit": "Profit (only if there is no cost column)",
}

# Words that suggest a field. Compared after lower-casing, removing accents
# and everything that is not a letter or digit.
SYNONYMS = {
    "date": ["date", "day", "month", "period", "time", "timestamp", "datetime", "orderdate", "invoicedate",
             "ημερομηνια", "ημερα", "μηνας", "περιοδος", "χρονος", "ημνια", "ημ"],
    "sales": ["sales", "revenue", "amount", "turnover", "income", "total", "gross", "netsales", "price", "value",
              "πωλησεις", "πωληση", "εσοδα", "εσοδο", "τζιρος", "αξια", "ποσο", "συνολο", "τιμη", "ποσον"],
    "cost": ["cost", "costs", "expense", "expenses", "cogs", "spend", "purchase",
             "κοστος", "εξοδα", "εξοδο", "δαπανη", "δαπανες", "αγορα"],
    "profit": ["profit", "margin", "earnings", "κερδος", "κερδη", "περιθωριο"],
    "units": ["units", "unit", "quantity", "qty", "pieces", "pcs", "count", "volume", "items",
              "τεμαχια", "τεμαχιο", "τεμ", "ποσοτητα", "μοναδες", "ποσ"],
    "product": ["product", "products", "item", "sku", "category", "categories", "service", "name", "description", "type", "brand", "department",
                "προιον", "προιοντα", "κατηγορια", "ειδος", "υπηρεσια", "ονομα", "περιγραφη", "τυπος", "μαρκα", "τμημα"],
    "region": ["region", "city", "area", "store", "branch", "channel", "country", "location", "shop", "zone", "market", "state",
               "περιοχη", "πολη", "καταστημα", "υποκαταστημα", "καναλι", "χωρα", "τοποθεσια", "νομος", "αγορα"],
}

MIN_PARSE_RATE = 0.8          # share of values that must parse for a date / number column
MAX_ROWS = 500_000


class MappingError(ValueError):
    """A problem the user can fix (wrong column chosen, unreadable file...)."""


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def normalize_name(value) -> str:
    text = unicodedata.normalize("NFKD", str(value).strip().lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("ς", "σ")
    return re.sub(r"[^0-9a-zα-ω]+", "", text)


SYNONYMS = {field: [normalize_name(w) for w in words] for field, words in SYNONYMS.items()}


def _decode(contents: bytes) -> str:
    if contents.startswith((b"\xff\xfe", b"\xfe\xff")):
        return contents.decode("utf-16")
    for encoding in ("utf-8-sig", "cp1253", "latin-1"):
        try:
            return contents.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise MappingError("Could not read the file text. Save it as UTF-8 CSV or Excel (.xlsx).")


def _sniff_delimiter(text: str) -> str:
    sample = text[:8192]
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        counts = {d: sample.count(d) for d in (",", ";", "\t", "|")}
        best = max(counts, key=counts.get)
        return best if counts[best] else ","


def _is_blank(value) -> bool:
    return value is None or (isinstance(value, float) and pd.isna(value)) or (isinstance(value, str) and not value.strip())


def _promote_header(raw: pd.DataFrame) -> pd.DataFrame:
    """Use the first row that looks like a header (skips title rows above it)."""
    raw = raw.dropna(how="all").dropna(axis=1, how="all").reset_index(drop=True)
    if raw.empty:
        raise MappingError("The file has no data.")

    width = raw.shape[1]
    header_row = 0
    for i in range(min(15, len(raw))):
        cells = list(raw.iloc[i])
        filled = [c for c in cells if not _is_blank(c)]
        texty = [c for c in filled if isinstance(c, str) and not re.fullmatch(r"[-+]?[\d.,\s]+", c.strip())]
        if len(filled) >= max(2, int(width * 0.6)) and len(texty) >= len(filled) * 0.7:
            header_row = i
            break

    names, seen = [], {}
    for i, cell in enumerate(raw.iloc[header_row]):
        name = "" if _is_blank(cell) else str(cell).strip()
        if not name:
            name = f"Column {i + 1}"
        if name in seen:
            seen[name] += 1
            name = f"{name} ({seen[name]})"
        else:
            seen[name] = 1
        names.append(name)

    table = raw.iloc[header_row + 1:].reset_index(drop=True)
    table.columns = names
    # Excel cells arrive as Python objects: turn all-date / all-number columns into real dtypes.
    return table.dropna(how="all").reset_index(drop=True).infer_objects()


# ---------------------------------------------------------------------------
# 1. Reading files
# ---------------------------------------------------------------------------
def list_sheets(contents: bytes, filename: str) -> list[str]:
    if not filename.lower().endswith((".xlsx", ".xlsm")):
        return []
    try:
        with pd.ExcelFile(BytesIO(contents), engine="openpyxl") as book:
            return list(book.sheet_names)
    except Exception as error:  # damaged or password protected files
        raise MappingError("Could not open the Excel file. Is it damaged or password protected?") from error


def read_table(contents: bytes, filename: str, sheet: str | None = None) -> pd.DataFrame:
    """Return the file as a DataFrame with a proper header row."""
    name = (filename or "").lower()
    if name.endswith(".xls"):
        raise MappingError("Old .xls files are not supported. Please save the file as .xlsx or .csv and upload it again.")

    if name.endswith((".xlsx", ".xlsm")):
        sheets = list_sheets(contents, filename)
        if not sheets:
            raise MappingError("The Excel file has no sheets.")
        chosen = sheet if sheet in sheets else sheets[0]
        try:
            raw = pd.read_excel(BytesIO(contents), sheet_name=chosen, header=None, engine="openpyxl")
        except Exception as error:
            raise MappingError("Could not read that Excel sheet.") from error
    elif name.endswith((".csv", ".txt", ".tsv")):
        text = _decode(contents)
        try:
            raw = pd.read_csv(StringIO(text), sep=_sniff_delimiter(text), header=None, dtype=str,
                              skip_blank_lines=True, engine="python", on_bad_lines="skip")
        except (pd.errors.ParserError, pd.errors.EmptyDataError, ValueError) as error:
            raise MappingError("Could not read the CSV file. Check that it is a valid table.") from error
    else:
        raise MappingError("Please upload a .csv or .xlsx file.")

    table = _promote_header(raw)
    if table.empty:
        raise MappingError("The file contains a header but no rows.")
    if len(table) > MAX_ROWS:
        raise MappingError(f"The file has {len(table):,} rows. The maximum is {MAX_ROWS:,}.")
    return table


# ---------------------------------------------------------------------------
# 2. Parsing values
# ---------------------------------------------------------------------------
def to_number(series: pd.Series) -> pd.Series:
    """Numbers from text such as '€1.234,50', '1,234.50', '(120)', '12 %'."""
    if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
        return pd.to_numeric(series, errors="coerce")

    def convert(value):
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return float("nan")
        if isinstance(value, (int, float)):
            return float(value)
        text = str(value).strip().replace(" ", "").replace(" ", "")
        if not text:
            return float("nan")
        negative = text.startswith("(") and text.endswith(")") or text.endswith("-") or text.startswith("-")
        text = re.sub(r"[^\d.,]", "", text)
        if not text:
            return float("nan")
        if "," in text and "." in text:
            decimal = "," if text.rfind(",") > text.rfind(".") else "."
            thousands = "." if decimal == "," else ","
            text = text.replace(thousands, "").replace(decimal, ".")
        elif "," in text:
            parts = text.split(",")
            if len(parts) == 2 and len(parts[1]) != 3:
                text = parts[0] + "." + parts[1]          # 12,5  or 1234,56
            else:
                text = "".join(parts)                      # 1,234  or 1,234,567
        elif text.count(".") > 1:
            text = text.replace(".", "")                   # 1.234.567
        try:
            number = float(text)
        except ValueError:
            return float("nan")
        return -number if negative else number

    return series.map(convert).astype(float)


def to_date(series: pd.Series) -> pd.Series:
    """Dates from real dates, Excel serial numbers or text in common formats."""
    if pd.api.types.is_datetime64_any_dtype(series):
        return pd.to_datetime(series, errors="coerce")

    numeric = pd.to_numeric(series, errors="coerce")
    if numeric.notna().mean() > 0.9 and numeric.dropna().between(20000, 80000).all():
        return pd.to_datetime(numeric, unit="D", origin="1899-12-30", errors="coerce")

    text = series.astype("string").str.strip()
    best = None
    for dayfirst in (False, True):
        parsed = pd.to_datetime(text, errors="coerce", dayfirst=dayfirst, format="mixed")
        if best is None or parsed.notna().sum() > best.notna().sum():
            best = parsed
        elif parsed.notna().sum() == best.notna().sum() and dayfirst:
            # Same number of successes: prefer day-first if a first part > 12 proves it.
            first_part = text.str.extract(r"^(\d{1,2})[/.\-]")[0].dropna().astype(int)
            if len(first_part) and (first_part > 12).any():
                best = parsed
    return best


# ---------------------------------------------------------------------------
# 3. Describing and guessing columns
# ---------------------------------------------------------------------------
_DATE_LIKE = re.compile(r"^\s*(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|\d{4}[-/.]\d{1,2})(\s|T|$)")
_HAS_WORDS = re.compile(r"[A-Za-zΑ-Ωα-ωά-ώ]{3,}")


def _kind(series: pd.Series) -> str:
    """'date', 'number', 'text' or 'empty'."""
    sample = series.dropna().head(500)
    if sample.empty:
        return "empty"
    if pd.api.types.is_datetime64_any_dtype(sample):
        return "date"
    if pd.api.types.is_numeric_dtype(sample) and not pd.api.types.is_bool_dtype(sample):
        return "number"

    text = sample.astype(str)
    if text.str.match(_DATE_LIKE).mean() >= MIN_PARSE_RATE and to_date(sample).notna().mean() >= MIN_PARSE_RATE:
        return "date"
    has_words = text.str.contains(_HAS_WORDS).mean()
    if has_words < 0.2 and to_number(sample).notna().mean() >= MIN_PARSE_RATE:
        return "number"
    if to_date(sample).notna().mean() >= MIN_PARSE_RATE and text.str.contains(r"\d").mean() > 0.9:
        return "date"
    return "text"


def describe_columns(df: pd.DataFrame) -> list[dict]:
    """One entry per column for the preview screen (type, sample values, categories)."""
    info = []
    for column in df.columns:
        series = df[column]
        kind = _kind(series)
        clean = series.dropna()
        entry = {
            "name": str(column),
            "kind": kind,
            "filled": int(len(clean)),
            "unique": int(clean.astype(str).nunique()),
            "samples": [str(v).replace(" 00:00:00", "")[:40] for v in clean.head(3).tolist()],
        }
        if kind == "text":
            top = clean.astype(str).str.strip().value_counts().head(6)
            entry["top_values"] = [{"value": str(k)[:40], "count": int(v)} for k, v in top.items()]
        info.append(entry)
    return info


def _name_score(column: str, field: str) -> float:
    name = normalize_name(column)
    if not name:
        return 0.0
    words = SYNONYMS[field]
    if name in words:
        return 1.0
    best = 0.0
    for word in words:
        if len(word) >= 3 and word in name:
            best = max(best, 0.7)
        elif len(name) >= 4 and name in word:
            best = max(best, 0.45)
    return best


def suggest_mapping(df: pd.DataFrame) -> dict:
    """Guess {field: column name or None}. Names are checked first, then the data."""
    kinds = {c: _kind(df[c]) for c in df.columns}
    uniques = {c: df[c].dropna().astype(str).nunique() for c in df.columns}
    rows = max(len(df), 1)

    wanted_kind = {"date": "date", "sales": "number", "cost": "number", "units": "number",
                   "product": "text", "region": "text", "profit": "number"}
    scores: list[tuple[float, str, str]] = []
    for field in FIELDS:
        for column in df.columns:
            kind = kinds[column]
            if kind != wanted_kind[field]:
                # a text column holding numbers (or the reverse) may still be right for product/region ids
                continue
            score = _name_score(column, field)
            if field in ("product", "region") and uniques[column] > max(50, rows * 0.6):
                score *= 0.3                                    # almost every row different: not a category
            scores.append((score, field, column))

    mapping: dict = {f: None for f in FIELDS}
    confidence: dict = {f: "none" for f in FIELDS}
    used: set = set()

    # 1) columns recognised by name
    for score, field, column in sorted(scores, key=lambda s: -s[0]):
        if score >= 0.45 and mapping[field] is None and column not in used:
            mapping[field], confidence[field] = column, "name"
            used.add(column)

    # 2) fall back to what the data looks like
    if mapping["date"] is None:
        dates = [c for c in df.columns if kinds[c] == "date" and c not in used]
        if dates:
            mapping["date"], confidence["date"] = dates[0], "data"
            used.add(dates[0])
    if mapping["sales"] is None:
        numbers = [c for c in df.columns if kinds[c] == "number" and c not in used]
        if numbers:
            pick = max(numbers, key=lambda c: float(to_number(df[c]).abs().sum()))
            mapping["sales"], confidence["sales"] = pick, "data"
            used.add(pick)
    texts = [c for c in df.columns if kinds[c] == "text" and c not in used and 1 < uniques[c] <= max(50, rows * 0.6)]
    texts.sort(key=lambda c: uniques[c], reverse=True)       # the richer category first
    if mapping["product"] is None and texts:
        mapping["product"], confidence["product"] = texts[0], "data"
        used.add(texts[0])
        texts = texts[1:]
    if mapping["region"] is None and texts:
        mapping["region"], confidence["region"] = min(texts, key=lambda c: uniques[c]), "data"

    return {"mapping": mapping, "confidence": confidence}


# ---------------------------------------------------------------------------
# 4. Building the standard table
# ---------------------------------------------------------------------------
def apply_mapping(df: pd.DataFrame, mapping: dict) -> tuple[pd.DataFrame, list[str]]:
    """Return (table with the 6 standard columns, list of warnings for the user)."""
    mapping = {f: (mapping.get(f) or None) for f in FIELDS}
    columns = [str(c) for c in df.columns]

    for field in REQUIRED:
        if not mapping[field]:
            raise MappingError(f"Please choose which column holds the {FIELD_LABELS[field].lower()}.")
    chosen = [c for c in mapping.values() if c]
    for column in chosen:
        if column not in columns:
            raise MappingError(f"Column '{column}' was not found in the file.")
    duplicates = {c for c in chosen if chosen.count(c) > 1}
    if duplicates:
        raise MappingError("The same column cannot be used for two fields: " + ", ".join(sorted(duplicates)) + ".")

    df = df.copy()
    df.columns = columns
    warnings: list[str] = []
    out = pd.DataFrame(index=df.index)

    dates = to_date(df[mapping["date"]])
    if dates.notna().mean() < MIN_PARSE_RATE:
        raise MappingError(f"Column '{mapping['date']}' does not look like dates "
                           f"(only {dates.notna().mean():.0%} of the values could be read as a date).")
    out["date"] = dates

    sales = to_number(df[mapping["sales"]])
    if sales.notna().mean() < MIN_PARSE_RATE:
        raise MappingError(f"Column '{mapping['sales']}' does not look like numbers "
                           f"(only {sales.notna().mean():.0%} of the values could be read as a number).")
    out["sales"] = sales

    if mapping["cost"]:
        cost = to_number(df[mapping["cost"]])
        if cost.notna().mean() < MIN_PARSE_RATE:
            raise MappingError(f"Column '{mapping['cost']}' does not look like numbers.")
        out["cost"] = cost
        if mapping["profit"]:
            warnings.append("Both cost and profit were chosen: the cost column is used and profit is ignored.")
    elif mapping["profit"]:
        profit = to_number(df[mapping["profit"]])
        if profit.notna().mean() < MIN_PARSE_RATE:
            raise MappingError(f"Column '{mapping['profit']}' does not look like numbers.")
        out["cost"] = sales - profit
        warnings.append(f"Cost was calculated as sales minus '{mapping['profit']}'.")
    else:
        out["cost"] = 0.0
        warnings.append("No cost column chosen: cost is set to 0, so profit and margin will equal sales.")

    if mapping["units"]:
        units = to_number(df[mapping["units"]])
        if units.notna().mean() < MIN_PARSE_RATE:
            raise MappingError(f"Column '{mapping['units']}' does not look like numbers.")
        out["units"] = units
    else:
        out["units"] = 1.0
        warnings.append("No units column chosen: every row is counted as 1 unit.")

    for field, fallback, label in (("product", "All products", "product / category"),
                                   ("region", "All regions", "region / group")):
        if mapping[field]:
            values = df[mapping[field]].astype("string").str.strip()
            blank = values.isna() | (values == "")
            if blank.any():
                warnings.append(f"{int(blank.sum())} rows had an empty {label}; they are labelled 'Unknown'.")
            out[field] = values.mask(blank, "Unknown").astype(str)
            if out[field].nunique() > 100:
                warnings.append(f"The {label} column has {out[field].nunique()} different values; "
                                "charts work best with fewer than about 30.")
        else:
            out[field] = fallback
            warnings.append(f"No {label} column chosen: all rows are grouped as '{fallback}'.")

    before = len(out)
    out = out[out["date"].notna() & out["sales"].notna()].copy()
    dropped = before - len(out)
    if dropped:
        warnings.append(f"{dropped} rows were skipped because the date or sales value was missing or unreadable.")
    if out.empty:
        raise MappingError("No usable rows were found with the chosen columns.")

    filled = int(out["cost"].isna().sum() + out["units"].isna().sum())
    out["cost"] = out["cost"].fillna(0.0)
    out["units"] = out["units"].fillna(0.0)
    if filled:
        warnings.append(f"{filled} empty cost/units values were set to 0.")

    negatives = int((out["sales"] < 0).sum())
    if negatives:
        warnings.append(f"{negatives} rows have negative sales (refunds?). They are kept.")

    out["date"] = out["date"].dt.normalize() if (out["date"].dt.hour == 0).all() else out["date"]
    out = out.sort_values("date").reset_index(drop=True)
    return out[STANDARD_COLUMNS], warnings


def summarize(table: pd.DataFrame) -> dict:
    """Short description of the finished table (for the success message)."""
    return {
        "rows": int(len(table)),
        "date_min": table["date"].min().strftime("%Y-%m-%d"),
        "date_max": table["date"].max().strftime("%Y-%m-%d"),
        "products": sorted(table["product"].unique().tolist())[:30],
        "product_count": int(table["product"].nunique()),
        "regions": sorted(table["region"].unique().tolist())[:30],
        "region_count": int(table["region"].nunique()),
    }
