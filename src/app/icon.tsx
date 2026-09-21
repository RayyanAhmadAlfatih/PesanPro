import { ImageResponse } from "next/og";

// Image metadata
export const size = {
    width: 32,
    height: 32,
};
export const contentType = "image/png";

// Image generation
export default function Icon() {
    const letter = (process.env.APP_NAME || "PesanPro").charAt(0).toUpperCase();
    const color = "#16a34a"; // green-600

    return new ImageResponse(
        (
            // ImageResponse JSX element
            <div
                style={{
                    fontSize: 20,
                    fontWeight: 800,
                    background: color,
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    borderRadius: "20%", // Rounded square looks more app-like
                    fontFamily: 'sans-serif'
                }}
            >
                {letter}
            </div>
        ),
        // ImageResponse options
        {
            ...size,
        }
    );
}
