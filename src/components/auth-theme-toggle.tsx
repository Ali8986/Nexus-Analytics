"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { IconButton } from "@/components/ui";

export function AuthThemeToggle() {
  const { toggleTheme } = useTheme();
  return (
    <IconButton label="Toggle color theme" onClick={toggleTheme}>
      <Sun className="theme-icon-light" size={18} />
      <Moon className="theme-icon-dark" size={18} />
    </IconButton>
  );
}
