import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] justify-items-center min-h-screen p-2 pt-0 pb-20 gap-8 sm:p-4 font-[family-name:var(--font-geist-sans)]">
      <Image 
        src="/IBS-logo-horiz-blanc-24-ssfond-medium.png" 
        alt="Logo Inter Blockchain Services" 
        width={300}
        height={100}
        className="w-auto h-26 mb-2 mx-auto" 
      />
      <main className="flex flex-col gap-6 row-start-2 items-center justify-center w-full max-w-4xl mx-auto mt-0">
        <div className="flex flex-col items-center gap-4 w-full">
          <h1 className="text-3xl font-bold text-center">Axelar Monitoring</h1>
          <p className="text-gray-600 dark:text-gray-300 text-center">
            Real-time monitoring of events via WebSocket
          </p>
        </div>

        <div className="flex gap-4 items-center justify-center flex-col sm:flex-row w-full">
          <Link
            className="rounded-full border border-solid border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#1a1a1a] hover:border-transparent font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 w-full sm:w-[200px] text-center whitespace-nowrap"
            href="/dashboard"
          >
            Validator dashboard
          </Link>
          <div className="relative group w-full sm:w-[200px]">
            <div
              className="rounded-full border border-solid border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#1a1a1a] hover:border-transparent font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 w-full cursor-not-allowed opacity-80 text-center whitespace-nowrap"
            >
              RPC Dashboard
            </div>
            <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/80 text-white px-2 py-1 text-xs rounded bottom-full left-1/2 transform -translate-x-1/2 -translate-y-2 whitespace-nowrap">
              Coming Soon
            </div>
          </div>
        </div>
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center w-full">
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          © 2025 Build by Inter Blockchain Services
        </p>
      </footer>
    </div>
  );
}
