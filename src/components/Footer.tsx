export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <span className="brand-name">
              <span className="brand-prompt">&gt;</span> SAThack
            </span>
            <p className="footer-tag">Read the system. Ace the SAT.</p>
          </div>
          <div className="footer-col">
            <h4>Prep</h4>
            <a href="#predictor">Score predictor</a>
            <a href="#plan">Study plan</a>
            <a href="#game">Gamification</a>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <a href="#">Terms of Service</a>
            <a href="#">Privacy Policy</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>
            SAT and AP are trademarks of the College Board, used here for identification only.
            SAThack is not affiliated with or endorsed by the College Board.
          </p>
          <p>© 2026 SAThack. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

