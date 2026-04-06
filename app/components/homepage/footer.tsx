import { Link } from "react-router";

export default function FooterSection() {
  return (
    <footer className="py-16">
      <div className="mx-auto max-w-5xl px-6">
        <div className="my-8 flex flex-wrap justify-center gap-6 text-sm">
          {/* Twitter / X */}
          <Link
            to="https://x.com/Vcontinentloyal"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X/Twitter"
            className="text-muted-foreground hover:text-primary block"
          >
            <svg
              className="size-6"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
            >
              <path
                fill="currentColor"
                d="M10.488 14.651L15.25 21h7l-7.858-10.478L20.93 3h-2.65l-5.117 5.886L8.75 3h-7l7.51 10.015L2.32 21h2.65zM16.25 19L5.75 5h2l10.5 14z"
              />
            </svg>
          </Link>
          {/* 小红书 */}
          <Link
            to="https://www.xiaohongshu.com/user/profile/69af9b54000000003303aceb"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="小红书"
            className="text-muted-foreground hover:text-primary block"
          >
            <svg className="size-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="24" height="24" rx="6" fill="#FF2442" />
              <path d="M17.5 7h-2v1.5h2V7zM7 7H5.5v10H7V7zm4.5 0H10v10h1.5V7zm5 3.5h-5V12h5v-1.5z" fill="white" />
              <path d="M6.5 11.5h5v1.5h-5v-1.5z" fill="white" />
            </svg>
          </Link>
        </div>
        <span className="text-muted-foreground block text-center text-sm">
          © {new Date().getFullYear()} DreamX AI, All rights reserved
        </span>
      </div>
    </footer>
  );
}
