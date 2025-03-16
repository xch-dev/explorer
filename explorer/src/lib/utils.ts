import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getTimeDifference(timestamp: number) {
  const diff = Date.now() - timestamp * 1000;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return seconds <= 1 ? "Just now" : `${seconds} seconds ago`;
  }
  if (minutes < 60) {
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }
  if (hours < 24) {
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  if (days < 7) {
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }

  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year:
      timestamp * 1000 < Date.now() - 365 * 24 * 60 * 60 * 1000
        ? "numeric"
        : undefined,
    hour: "2-digit",
    minute: "2-digit",
  });
}
