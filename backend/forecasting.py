import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression


def forecast_revenue(data, periods=3, threshold=50):

    # Prepare monthly data and detect anomalies
    monthly = prepare_forecast_data(
        data,
        threshold=threshold
    )

    # Use adjusted revenue for forecasting
    X = monthly[["month_number"]]
    y = monthly["adjusted_revenue"]

    model = LinearRegression()

    model.fit(X, y)

    # Historical predictions
    historical_predictions = model.predict(X)

    # Residuals
    residuals = y - historical_predictions

    # Standard deviation of the residuals
    residual_std = np.std(residuals)

    # Future months
    future_months = range(
        len(monthly),
        len(monthly) + periods
    )

    future_X = pd.DataFrame({
        "month_number": future_months
    })

    predictions = model.predict(future_X)

    # Approximate 95% prediction range
    margin = 1.96 * residual_std

    lower_bound = predictions - margin
    upper_bound = predictions + margin

    return {
        "historical": monthly,
        "forecast": predictions,
        "lower_bound": lower_bound,
        "upper_bound": upper_bound
    }

from sklearn.metrics import mean_absolute_error, mean_squared_error


def evaluate_forecast(data):

    monthly = data.groupby(
        data["date"].dt.to_period("M")
    ).agg(
        revenue=("sales", "sum")
    ).reset_index()

    monthly["month_number"] = range(len(monthly))


    # We need at least 3 periods:
    # some for training and at least one for testing.

    if len(monthly) < 3:
        return {
            "mae": 0,
            "rmse": 0,
            "mape": 0,
            "message": "Not enough data to evaluate the model."
        }


    # Keep the last period for testing.
    train = monthly.iloc[:-1]
    test = monthly.iloc[-1:]


    X_train = train[["month_number"]]
    y_train = train["revenue"]

    X_test = test[["month_number"]]
    y_test = test["revenue"]


    model = LinearRegression()

    model.fit(
        X_train,
        y_train
    )


    predictions = model.predict(
        X_test
    )


    mae = mean_absolute_error(
        y_test,
        predictions
    )


    rmse = np.sqrt(
        mean_squared_error(
            y_test,
            predictions
        )
    )


    actual = y_test.iloc[0]
    predicted = predictions[0]


    if actual != 0:

        mape = (
            abs(
                (actual - predicted)
                / actual
            ) * 100
        )

    else:

        mape = 0


    return {

        "mae": float(mae),

        "rmse": float(rmse),

        "mape": float(mape),

        "actual": float(actual),

        "predicted": float(predicted),

        "test_period": str(
            test["date"].iloc[0]
        )

    }
def prepare_forecast_data(data, threshold=50):

    monthly = data.groupby(
        data["date"].dt.to_period("M")
    ).agg(
        revenue=("sales", "sum")
    ).reset_index()

    monthly["month_number"] = range(len(monthly))

    monthly["growth_percent"] = (
        monthly["revenue"].pct_change() * 100
    )

    monthly["adjusted_revenue"] = monthly["revenue"]

    for i in range(1, len(monthly)):

        growth = monthly.loc[
            i,
            "growth_percent"
        ]

        if growth > threshold:

            previous_revenue = monthly.loc[
                i - 1,
                "revenue"
            ]

            monthly.loc[
                i,
                "adjusted_revenue"
            ] = previous_revenue

    return monthly
def evaluate_adjusted_forecast(data, threshold=50):

    monthly = prepare_forecast_data(
        data,
        threshold=threshold
    )

    if len(monthly) < 3:
        return {
            "mae": 0,
            "rmse": 0,
            "mape": 0,
            "message": "Not enough data to evaluate the model."
        }

    train = monthly.iloc[:-1]
    test = monthly.iloc[-1:]

    X_train = train[["month_number"]]
    y_train = train["adjusted_revenue"]

    X_test = test[["month_number"]]
    y_test = test["revenue"]

    model = LinearRegression()

    model.fit(
        X_train,
        y_train
    )

    predictions = model.predict(X_test)

    mae = mean_absolute_error(
        y_test,
        predictions
    )

    rmse = np.sqrt(
        mean_squared_error(
            y_test,
            predictions
        )
    )

    actual = y_test.iloc[0]
    predicted = predictions[0]

    if actual != 0:

        mape = (
            abs(
                (actual - predicted)
                / actual
            ) * 100
        )

    else:
        mape = 0

    return {
        "mae": float(mae),
        "rmse": float(rmse),
        "mape": float(mape),
        "actual": float(actual),
        "predicted": float(predicted),
        "test_period": str(
            test["date"].iloc[0]
        )
    }
def evaluate_rolling_forecast(data, adjusted=False, threshold=50):

    if adjusted:
        monthly = prepare_forecast_data(
            data,
            threshold=threshold
        )
        revenue_column = "adjusted_revenue"
    else:
        monthly = data.groupby(
            data["date"].dt.to_period("M")
        ).agg(
            revenue=("sales", "sum")
        ).reset_index()

        monthly["month_number"] = range(len(monthly))
        revenue_column = "revenue"

    if len(monthly) < 3:
        return {
            "mae": 0,
            "rmse": 0,
            "mape": 0,
            "tests": 0,
            "message": "Not enough data for rolling validation."
        }

    errors = []

    for test_index in range(2, len(monthly)):

        train = monthly.iloc[:test_index]
        test = monthly.iloc[test_index:test_index + 1]

        X_train = train[["month_number"]]
        y_train = train[revenue_column]

        X_test = test[["month_number"]]

        model = LinearRegression()

        model.fit(
            X_train,
            y_train
        )

        prediction = model.predict(X_test)[0]

        actual = test["revenue"].iloc[0]

        absolute_error = abs(
            actual - prediction
        )

        squared_error = (
            actual - prediction
        ) ** 2

        if actual != 0:
            percentage_error = (
                abs(actual - prediction)
                / actual
            ) * 100
        else:
            percentage_error = 0

        errors.append({
            "date": str(test["date"].iloc[0]),
            "actual": float(actual),
            "predicted": float(prediction),
            "absolute_error": float(absolute_error),
            "squared_error": float(squared_error),
            "percentage_error": float(percentage_error)
        })

    mae = np.mean([
        error["absolute_error"]
        for error in errors
    ])

    rmse = np.sqrt(
        np.mean([
            error["squared_error"]
            for error in errors
        ])
    )

    mape = np.mean([
        error["percentage_error"]
        for error in errors
    ])

    return {
        "mae": float(mae),
        "rmse": float(rmse),
        "mape": float(mape),
        "tests": len(errors),
        "details": errors
    }