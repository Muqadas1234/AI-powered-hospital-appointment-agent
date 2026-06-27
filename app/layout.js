import "./globals.css";

export const metadata = {
  title: "CareVoice | Hospital appointment helpline",
  description: "Talk to our AI receptionist for bookings, or switch to Admin for staff tools.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
