import "./globals.css";

export const metadata = {
  title: "Andrea Aan De Top",
  description: "Fiets, hardloop & klim dashboard voor Andrea",
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: false,
  themeColor: "#0a0a0f",
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
