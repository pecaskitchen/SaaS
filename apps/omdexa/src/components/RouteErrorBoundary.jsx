import React from 'react';

export default class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('route_render_failed', { message: error?.message, componentStack: info?.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="load-state" role="alert">
        <div className="load-state-card">
          <h1>No pudimos abrir esta vista</h1>
          <p>Revisa tu conexión e inténtalo de nuevo. Tus datos no se modificaron.</p>
          <button type="button" className="primary" onClick={() => window.location.reload()}>Reintentar</button>
        </div>
      </main>
    );
  }
}
