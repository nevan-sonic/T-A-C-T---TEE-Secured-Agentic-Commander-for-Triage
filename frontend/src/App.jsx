import { useState } from 'react'

export default function App() {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('t3n-secure')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => {
      sessionStorage.setItem('tact_auth', 'true')
      sessionStorage.setItem('tact_operator', username)
      setSuccess(true)
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 1500)
    }, 1200)
  }

  return (
    <div className="login-page">
      <div className="login-wrapper">
        <div className="login-card">
          <div className="logo-section">
            <div className="t3-logo">T3</div>
            <h1 className="title">SECURE ACCESS GATE</h1>
            <p className="subtitle">DEPARTMENT OF INCIDENTS</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label className="label">USERNAME</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter operator ID"
                className="input-field"
                required
              />
            </div>

            <div className="form-group">
              <label className="label">PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter access key"
                className="input-field"
                required
              />
            </div>

            <button
              type="submit"
              className={`sign-in-btn ${loading ? 'loading' : ''} ${success ? 'success' : ''}`}
              disabled={loading || success}
            >
              {loading && !success ? (
                <>
                  <span className="spinner"></span>
                  AUTHENTICATING...
                </>
              ) : success ? (
                <>AUTHENTICATED - REDIRECTING...</>
              ) : (
                <>SIGN IN TO CONTROL PLANE</>
              )}
            </button>
          </form>

          <div className="footer-section">
            <div className="status-line">
              <span className="green-dot"></span>
              T3N TESTNET &bull; ENCLAVE READY
            </div>
            <div className="demo-creds">
              Demo credentials:
              <span className="pill">admin</span>
              <span className="pill">t3n-secure</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
