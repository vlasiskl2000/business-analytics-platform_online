from backend.data_loader import load_sales_data
from backend.forecasting import (
    forecast_revenue,
    evaluate_forecast,
    evaluate_adjusted_forecast,
    evaluate_rolling_forecast,
    prepare_forecast_data
)

data = load_sales_data()

result = forecast_revenue(
    data,
    periods=3
)


print("\nHISTORICAL DATA")
print(result["historical"])


print("\nFORECAST")

for i, prediction in enumerate(
    result["forecast"],
    start=1
):

    lower = result["lower_bound"][i - 1]
    upper = result["upper_bound"][i - 1]

    print(f"\nMonth +{i}")

    print(
        f"Forecast:     €{prediction:,.2f}"
    )

    print(
        f"Lower bound:  €{lower:,.2f}"
    )

    print(
        f"Upper bound:  €{upper:,.2f}"
    )
    print("\nMODEL EVALUATION")

evaluation = evaluate_forecast(data)

print(
    f"Test period: {evaluation['test_period']}"
)

print(
    f"Actual: €{evaluation['actual']:,.2f}"
)

print(
    f"Predicted: €{evaluation['predicted']:,.2f}"
)

print(
    f"MAE: €{evaluation['mae']:,.2f}"
)

print(
    f"RMSE: €{evaluation['rmse']:,.2f}"
)

print(
    f"MAPE: {evaluation['mape']:.2f}%"
)
print("\nANOMALY ADJUSTMENT")
print("\nADJUSTED MODEL EVALUATION")

adjusted_evaluation = evaluate_adjusted_forecast(data)

print(
    f"Test period: "
    f"{adjusted_evaluation['test_period']}"
)

print(
    f"Actual: "
    f"€{adjusted_evaluation['actual']:,.2f}"
)

print(
    f"Predicted: "
    f"€{adjusted_evaluation['predicted']:,.2f}"
)

print(
    f"MAE: "
    f"€{adjusted_evaluation['mae']:,.2f}"
)

print(
    f"RMSE: "
    f"€{adjusted_evaluation['rmse']:,.2f}"
)

print(
    f"MAPE: "
    f"{adjusted_evaluation['mape']:.2f}%"
)

prepared_data = prepare_forecast_data(data)

print(
    prepared_data[
        [
            "date",
            "revenue",
            "growth_percent",
            "adjusted_revenue"
        ]
    ]
)
print("\nROLLING VALIDATION - RAW MODEL")

raw_rolling = evaluate_rolling_forecast(
    data,
    adjusted=False
)

print(
    f"Tests: {raw_rolling['tests']}"
)

print(
    f"MAE: €{raw_rolling['mae']:,.2f}"
)

print(
    f"RMSE: €{raw_rolling['rmse']:,.2f}"
)

print(
    f"MAPE: {raw_rolling['mape']:.2f}%"
)


print("\nROLLING VALIDATION - ADJUSTED MODEL")

adjusted_rolling = evaluate_rolling_forecast(
    data,
    adjusted=True
)

print(
    f"Tests: {adjusted_rolling['tests']}"
)

print(
    f"MAE: €{adjusted_rolling['mae']:,.2f}"
)

print(
    f"RMSE: €{adjusted_rolling['rmse']:,.2f}"
)

print(
    f"MAPE: {adjusted_rolling['mape']:.2f}%"
)


print("\nROLLING VALIDATION DETAILS")

for raw, adjusted in zip(
    raw_rolling["details"],
    adjusted_rolling["details"]
):

    print(
        f"\n{raw['date']}"
    )

    print(
        f"Actual: €{raw['actual']:,.2f}"
    )

    print(
        f"Raw prediction: "
        f"€{raw['predicted']:,.2f}"
    )

    print(
        f"Adjusted prediction: "
        f"€{adjusted['predicted']:,.2f}"
    )