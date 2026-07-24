import { Component, ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Top-level error boundary so a single render/runtime error on old WebViews
 * does not leave the user staring at a blank white screen. Shows a small
 * recovery UI with a reload button. Does NOT alter app behavior otherwise.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    try { console.error("App crashed:", error, info); } catch { /* ignore */ }
  }

  handleReload = () => {
    try { window.location.reload(); } catch { /* ignore */ }
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#1a1207",
          color: "#f5e6c4",
          fontFamily: "system-ui, -apple-system, sans-serif",
          textAlign: "center",
        }}>
          <div style={{ maxWidth: 360 }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>🔑</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>DocLocker hit a snag</h1>
            <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 20 }}>
              Something interrupted loading. Please reload to try again.
            </p>
            <button
              onClick={this.handleReload}
              style={{
                background: "#b8860b",
                color: "#1a1207",
                border: 0,
                padding: "10px 22px",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
