import React from "react";
import CircularProgress from "@mui/material/CircularProgress";

export default function CircleLoader({ size = 28 }) {
    return (
        <div
            style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                padding: 8,
            }}
        >
            <CircularProgress size={size} />
        </div>
    );
}
