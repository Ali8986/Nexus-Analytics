import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Nexus Analytics",
    template: "%s | Nexus Analytics",
  },
  description:
    "A clearer view of your business. Explore a fictional Nexus Analytics workspace.",
};

const setInitialTheme = `
  try {
    var savedTheme = localStorage.getItem("nexus-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = savedTheme || (prefersDark ? "dark" : "light");
  } catch {
    document.documentElement.dataset.theme = "light";
  }
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: setInitialTheme }} />
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
