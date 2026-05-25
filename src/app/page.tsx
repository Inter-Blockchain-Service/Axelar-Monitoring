import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] justify-items-center min-h-screen bg-black text-white p-2 pt-0 pb-20 gap-8 sm:p-4">
      <Image 
        src="/IBS-logo-horiz-blanc-24-ssfond-medium.png" 
        alt="Logo Inter Blockchain Services" 
        width={300}
        height={100}
        className="w-auto h-26 mb-2 mx-auto" 
      />
      <main className="flex flex-col gap-6 row-start-2 items-center justify-center w-full max-w-4xl mx-auto mt-0">
        <div className="flex flex-col items-center gap-4 w-full">
          <h1 className="text-4xl font-bold text-center text-white">Axelar Monitoring</h1>
          <p className="text-[#a0a0a0] text-center">
            Real-time monitoring of events via WebSocket
          </p>
        </div>

        <div className="flex gap-4 items-center justify-center flex-col sm:flex-row w-full mt-4">
          <Link
            className="rounded-lg bg-[#fbb800] hover:bg-[#fcc420] transition-colors flex items-center justify-center font-medium text-sm sm:text-base h-11 sm:h-12 px-6 sm:px-8 w-full sm:w-auto text-center whitespace-nowrap text-black"
            href="/dashboard"
          >
            Validator Dashboard
          </Link>
          <div className="relative group w-full sm:w-auto">
            <div
              className="rounded-lg border border-[#2a2a2a] transition-colors flex items-center justify-center font-medium text-sm sm:text-base h-11 sm:h-12 px-6 sm:px-8 w-full cursor-not-allowed opacity-50 text-center whitespace-nowrap text-white"
            >
              RPC Dashboard
            </div>
            <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-[#1a1a1a] border border-[#2a2a2a] text-white px-3 py-2 text-xs rounded bottom-full left-1/2 transform -translate-x-1/2 -translate-y-2 whitespace-nowrap">
              Coming Soon
            </div>
          </div>
        </div>
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center w-full">
        <p className="text-[#a0a0a0] text-sm">
          © 2025 Built by Inter Blockchain Services
        </p>
      </footer>
    </div>
  );
}
