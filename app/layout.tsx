import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "MyHouse + MyPro — the operating system for home ownership",
  description:
    "MyHouse gives every home a digital twin, permanent history, and a maintenance brain. MyPro gives every service professional the business OS. Two products, one shared record.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Nav />
        <main>{children}</main>
        <footer className="mt-20 border-t border-stone-200 py-8">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 text-center text-sm text-stone-500">
            <p>
              MyHouse + MyPro · the operating system for home ownership · demo
              build (mock data, no real bookings)
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
