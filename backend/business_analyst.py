import pandas as pd
def analyze_revenue_change(data):

    monthly = (
        data.groupby(
            data["date"].dt.to_period("M")
        )
        .agg(
            revenue=("sales", "sum"),
            cost=("cost", "sum"),
            units=("units", "sum")
        )
        .sort_index()
    )

    if len(monthly) < 2:

        return {
            "answer": "Not enough data to analyze revenue changes."
        }

    latest_month = monthly.index[-1]
    previous_month = monthly.index[-2]

    latest = monthly.iloc[-1]
    previous = monthly.iloc[-2]

    revenue_change = (
        (latest["revenue"] - previous["revenue"])
        / previous["revenue"]
        * 100
    )

    profit_latest = (
        latest["revenue"] - latest["cost"]
    )

    profit_previous = (
        previous["revenue"] - previous["cost"]
    )

    profit_change = (
        (profit_latest - profit_previous)
        / abs(profit_previous)
        * 100
    )

    units_change = (
        (latest["units"] - previous["units"])
        / previous["units"]
        * 100
    )

    product_monthly = (
        data.assign(
            month=data["date"].dt.to_period("M")
        )
        .groupby(
            ["month", "product"]
        )["sales"]
        .sum()
        .reset_index()
    )

    latest_products = product_monthly[
        product_monthly["month"] == latest_month
    ]

    previous_products = product_monthly[
        product_monthly["month"] == previous_month
    ]

    product_comparison = latest_products.merge(
        previous_products,
        on="product",
        how="outer",
        suffixes=("_latest", "_previous")
    ).fillna(0)

    product_comparison["change"] = (
        product_comparison["sales_latest"]
        - product_comparison["sales_previous"]
    )

    biggest_product_change = (
        product_comparison
        .sort_values("change")
        .iloc[0]
    )

    region_monthly = (
        data.assign(
            month=data["date"].dt.to_period("M")
        )
        .groupby(
            ["month", "region"]
        )["sales"]
        .sum()
        .reset_index()
    )

    latest_regions = region_monthly[
        region_monthly["month"] == latest_month
    ]

    previous_regions = region_monthly[
        region_monthly["month"] == previous_month
    ]

    region_comparison = latest_regions.merge(
        previous_regions,
        on="region",
        how="outer",
        suffixes=("_latest", "_previous")
    ).fillna(0)

    region_comparison["change"] = (
        region_comparison["sales_latest"]
        - region_comparison["sales_previous"]
    )

    biggest_region_change = (
        region_comparison
        .sort_values("change")
        .iloc[0]
    )

    return {
        "latest_month": str(latest_month),
        "previous_month": str(previous_month),
        "revenue_change_percent": round(
            revenue_change,
            2
        ),
        "profit_change_percent": round(
            profit_change,
            2
        ),
        "units_change_percent": round(
            units_change,
            2
        ),
        "biggest_product_driver": {
            "product": biggest_product_change["product"],
            "change": round(
                biggest_product_change["change"],
                2
            )
        },
        "biggest_region_driver": {
            "region": biggest_region_change["region"],
            "change": round(
                biggest_region_change["change"],
                2
            )
        }
    }
def calculate_revenue_contributions(data):

    data = data.copy()

    data["month"] = data["date"].dt.to_period("M")

    monthly = (
        data.groupby("month")["sales"]
        .sum()
        .sort_index()
    )

    if len(monthly) < 2:
        return {
            "error": "Not enough data."
        }

    latest_month = monthly.index[-1]
    previous_month = monthly.index[-2]

    # Product contribution
    product_monthly = (
        data.groupby(
            ["month", "product"]
        )["sales"]
        .sum()
        .reset_index()
    )

    latest_products = product_monthly[
        product_monthly["month"] == latest_month
    ]

    previous_products = product_monthly[
        product_monthly["month"] == previous_month
    ]

    product_comparison = latest_products.merge(
        previous_products,
        on="product",
        how="outer",
        suffixes=("_latest", "_previous")
    ).fillna(0)

    product_comparison["change"] = (
        product_comparison["sales_latest"]
        - product_comparison["sales_previous"]
    )

    product_comparison = product_comparison.sort_values(
        "change",
        ascending=False
    )

    # Region contribution
    region_monthly = (
        data.groupby(
            ["month", "region"]
        )["sales"]
        .sum()
        .reset_index()
    )

    latest_regions = region_monthly[
        region_monthly["month"] == latest_month
    ]

    previous_regions = region_monthly[
        region_monthly["month"] == previous_month
    ]

    region_comparison = latest_regions.merge(
        previous_regions,
        on="region",
        how="outer",
        suffixes=("_latest", "_previous")
    ).fillna(0)

    region_comparison["change"] = (
        region_comparison["sales_latest"]
        - region_comparison["sales_previous"]
    )

    region_comparison = region_comparison.sort_values(
        "change",
        ascending=False
    )

    return {
        "latest_month": str(latest_month),
        "previous_month": str(previous_month),

        "products": [
            {
                "product": row["product"],
                "change": round(
                    float(row["change"]),
                    2
                )
            }
            for _, row in product_comparison.iterrows()
        ],

        "regions": [
            {
                "region": row["region"],
                "change": round(
                    float(row["change"]),
                    2
                )
            }
            for _, row in region_comparison.iterrows()
        ]
    }
def answer_business_question(data, question):

    question = question.lower().strip()

    # Product analysis
    if "product" in question:

        product_sales = (
            data.groupby("product")["sales"]
            .sum()
            .sort_values(ascending=False)
        )

        best_product = product_sales.index[0]

        return {
            "question": question,
            "answer": (
                f"The product generating the highest "
                f"revenue is {best_product}, "
                f"with €{product_sales.iloc[0]:,.2f}."
            )
        }

    # Region analysis
    if "region" in question:

        region_sales = (
            data.groupby("region")["sales"]
            .sum()
            .sort_values(ascending=False)
        )

        best_region = region_sales.index[0]

        return {
            "question": question,
            "answer": (
                f"The region generating the highest "
                f"revenue is {best_region}, "
                f"with €{region_sales.iloc[0]:,.2f}."
            )
        }

    # Profit analysis
    if "profit" in question:

        total_profit = (
            data["sales"].sum()
            - data["cost"].sum()
        )

        margin = (
            total_profit
            / data["sales"].sum()
            * 100
        )

        return {
            "question": question,
            "answer": (
                f"Total profit is €{total_profit:,.2f} "
                f"with a profit margin of "
                f"{margin:.2f}%."
            )
        }
    # Revenue change / root cause analysis
        # Revenue change / root cause analysis
    if (
        "why" in question
        and (
            "revenue" in question
            or "sales" in question
        )
    ):

        analysis = analyze_revenue_change(data)
        contributions = calculate_revenue_contributions(data)

        if "answer" in analysis:
            return analysis

        revenue_change = analysis[
            "revenue_change_percent"
        ]

        if revenue_change > 0:

            direction = "increased"

        elif revenue_change < 0:

            direction = "decreased"

        else:

            direction = "remained unchanged"

        positive_products = [
            item
            for item in contributions["products"]
            if item["change"] > 0
        ]

        negative_products = [
            item
            for item in contributions["products"]
            if item["change"] < 0
        ]

        positive_regions = [
            item
            for item in contributions["regions"]
            if item["change"] > 0
        ]

        negative_regions = [
            item
            for item in contributions["regions"]
            if item["change"] < 0
        ]

        answer_parts = [
            f"Revenue {direction} by "
            f"{abs(revenue_change):.2f}% "
            f"from {analysis['previous_month']} "
            f"to {analysis['latest_month']}."
        ]

        # Product contributors
        if positive_products:

            top_product = positive_products[0]

            answer_parts.append(
                f"The strongest positive product contributor "
                f"was {top_product['product']} "
                f"(+€{top_product['change']:,.2f})."
            )

        if negative_products:

            top_negative_product = negative_products[-1]

            answer_parts.append(
                f"The largest negative product contributor "
                f"was {top_negative_product['product']} "
                f"(-€{abs(top_negative_product['change']):,.2f})."
            )

        # Region contributors
        if positive_regions:

            top_region = positive_regions[0]

            answer_parts.append(
                f"The strongest positive regional contributor "
                f"was {top_region['region']} "
                f"(+€{top_region['change']:,.2f})."
            )

        if negative_regions:

            top_negative_region = negative_regions[-1]

            answer_parts.append(
                f"The largest negative regional contributor "
                f"was {top_negative_region['region']} "
                f"(-€{abs(top_negative_region['change']):,.2f})."
            )

        answer_parts.append(
            f"Units changed by "
            f"{analysis['units_change_percent']:.2f}%, "
            f"while profit changed by "
            f"{analysis['profit_change_percent']:.2f}%."
        )

        return {
            "question": question,
            "answer": " ".join(answer_parts)
        }
    # Revenue analysis
    if "revenue" in question or "sales" in question:

        total_revenue = data["sales"].sum()

        monthly = (
            data.groupby(
                data["date"].dt.to_period("M")
            )["sales"]
            .sum()
            .sort_index()
        )

        if len(monthly) >= 2:

            latest = monthly.iloc[-1]
            previous = monthly.iloc[-2]

            change = (
                (latest - previous)
                / previous
                * 100
            )

            if change > 0:
                direction = "increased"
            else:
                direction = "decreased"

            return {
                "question": question,
                "answer": (
                    f"Total revenue is €{total_revenue:,.2f}. "
                    f"Revenue {direction} by "
                    f"{abs(change):.2f}% compared with "
                    f"the previous month."
                )
            }

        return {
            "question": question,
            "answer": (
                f"Total revenue is €{total_revenue:,.2f}."
            )
        }

    return {
        "question": question,
        "answer": (
            "I could not identify a supported business "
            "question. Try asking about revenue, profit, "
            "products or regions."
        )
    }