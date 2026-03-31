import React, { useEffect, useState } from "react";
import { useBotStore } from "../store/useBotStore";
import { useWebSocket } from "../ws/useWebSocket";
import "../App.css";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { isConnected } = useWebSocket();
  const [currentTime, setCurrentTime] = useState(new Date());
  const notifications = useBotStore((s) => s.notifications);
  const clearNotification = useBotStore((s) => s.clearNotification);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-dismiss notifications after 6 seconds
  useEffect(() => {
    if (notifications.length === 0) return;
    const latest = notifications[notifications.length - 1];
    const timeout = setTimeout(() => {
      clearNotification(latest.id);
    }, 6000);
    return () => clearTimeout(timeout);
  }, [notifications, clearNotification]);

  const timeString = currentTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const dateString = currentTime.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="layout">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="layout-header">
        <div className="layout-header__brand">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
          <span>AI</span> Trading Bot
        </div>

        <div className="layout-header__right">
          <div className="connection-status">
            <span
              className={`connection-dot ${
                isConnected
                  ? "connection-dot--active"
                  : "connection-dot--inactive"
              }`}
            />
            {isConnected ? "Live" : "Disconnected"}
          </div>
          <span style={{ color: "var(--text-muted)" }}>|</span>
          <span>
            {dateString} &nbsp;
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {timeString}
            </span>
          </span>
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <main className="layout-main">{children}</main>

      {/* ── Notification Bar ────────────────────────────────────────────── */}
      {notifications.length > 0 && (
        <div className="notification-bar">
          {notifications.slice(-5).map((notif) => (
            <div
              key={notif.id}
              className={`notification notification--${notif.type}`}
            >
              <span>{notif.message}</span>
              <button
                className="notification__close"
                onClick={() => clearNotification(notif.id)}
                aria-label="Dismiss"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
