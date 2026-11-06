import { Bell, Download, Menu, Plus, Share2, Smartphone } from "lucide-react";

export type PushStatus = "unsupported" | "default" | "denied" | "enabled" | "loading" | "error";

export type AppEnvironment = {
  checked: boolean;
  mobile: boolean;
  standalone: boolean;
  ios: boolean;
};

export function RequiredAppSetup({
  environment,
  canInstall,
  installing,
  onInstall,
}: {
  environment: AppEnvironment;
  canInstall: boolean;
  installing: boolean;
  onInstall: () => void;
}) {
  const desktopBlocked = environment.checked && !environment.mobile;

  return (
    <main className="grid min-h-screen place-items-center px-4 py-6">
      <section
        className={`surface-card w-full overflow-hidden ${desktopBlocked ? "max-w-2xl" : "max-w-md"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-setup-title"
      >
        <div className="border-b border-zinc-800 bg-gradient-to-r from-red-950/70 to-zinc-950 p-5">
          <div className="grid h-12 w-12 place-items-center rounded-md bg-honda text-white shadow-sm shadow-red-950/60">
            <Smartphone className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 id="app-setup-title" className="mt-4 text-xl font-bold text-white">
            {desktopBlocked ? "Phone required" : "Add CasePilot to Home Screen"}
          </h1>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            {desktopBlocked
              ? "CasePilot hanya boleh digunakan melalui telefon selepas dipasang pada Home Screen."
              : "Pasang CasePilot dahulu untuk teruskan."}
          </p>
        </div>

        <div className="grid gap-4 p-5">
          {desktopBlocked ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <InstallGuide
                title="iPhone / iPad"
                steps={[
                  "Buka coshonda.vercel.app menggunakan Safari.",
                  "Tekan ikon Share di bahagian bawah Safari.",
                  "Scroll dan pilih Add to Home Screen.",
                  "Tekan Add di penjuru kanan atas.",
                  "Buka CasePilot melalui ikon pada Home Screen.",
                ]}
              />
              <InstallGuide
                title="Android"
                steps={[
                  "Buka coshonda.vercel.app menggunakan Chrome.",
                  "Tekan menu tiga titik di penjuru Chrome.",
                  "Pilih Install app atau Add to Home screen.",
                  "Tekan Install atau Add untuk sahkan.",
                  "Buka CasePilot melalui ikon pada Home Screen.",
                ]}
              />
              <p className="rounded-md border border-red-900/70 bg-red-950/40 p-4 text-sm leading-6 text-red-100 sm:col-span-2">
                Selepas login, tekan Allow notifications apabila popup keluar. Notification wajib
                diaktifkan sebelum dashboard boleh digunakan.
              </p>
            </div>
          ) : environment.ios ? (
            <ol className="grid gap-3 text-sm text-zinc-200">
              <li className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <Share2 className="h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
                <span>Tekan butang Share dalam Safari.</span>
              </li>
              <li className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <Plus className="h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
                <span>Pilih Add to Home Screen.</span>
              </li>
              <li className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <Smartphone className="h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
                <span>Buka CasePilot daripada ikon Home Screen.</span>
              </li>
            </ol>
          ) : (
            <>
              <p className="rounded-md border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300">
                Pasang CasePilot, kemudian buka melalui ikon pada Home Screen.
              </p>
              {canInstall ? (
                <button
                  type="button"
                  className="primary-button w-full"
                  onClick={onInstall}
                  disabled={installing}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {installing ? "Installing" : "Install CasePilot"}
                </button>
              ) : (
                <p className="text-sm leading-6 text-zinc-400">
                  Dalam menu Chrome, pilih <strong className="text-zinc-200">Add to Home screen</strong>,
                  kemudian buka CasePilot melalui ikon tersebut.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function InstallGuide({ title, steps }: { title: string; steps: string[] }) {
  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-950 p-4">
      <h2 className="font-semibold text-white">{title}</h2>
      <ol className="mt-3 grid gap-3">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm leading-5 text-zinc-300">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-600 text-xs font-bold text-white">
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function RequiredNotificationSetup({
  status,
  message,
  onEnable,
  onOpenMenu,
}: {
  status: PushStatus;
  message: string;
  onEnable: () => void;
  onOpenMenu: () => void;
}) {
  const blocked = status === "denied";
  const unsupported = status === "unsupported";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-6">
      <section
        className="surface-card w-full max-w-md overflow-hidden"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="notification-setup-title"
      >
        <div className="border-b border-zinc-800 bg-gradient-to-r from-red-950/70 to-zinc-950 p-5">
          <button type="button" className="icon-button float-right" onClick={onOpenMenu} aria-label="Open navigation menu"><Menu className="h-5 w-5" /></button>
          <div className="grid h-12 w-12 place-items-center rounded-md bg-honda text-white shadow-sm shadow-red-950/60">
            <Bell className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 id="notification-setup-title" className="mt-4 text-xl font-bold text-white">
            Notification required
          </h1>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            Benarkan notification sebelum menggunakan CasePilot.
          </p>
        </div>

        <div className="grid gap-3 p-5">
          {blocked ? (
            <p className="rounded-md border border-red-900 bg-red-950/60 p-4 text-sm leading-6 text-red-100">
              Notification telah disekat. Buka Phone Settings, pilih CasePilot, aktifkan Notifications,
              kemudian buka semula aplikasi.
            </p>
          ) : unsupported ? (
            <p className="rounded-md border border-amber-800 bg-amber-950/50 p-4 text-sm leading-6 text-amber-100">
              Peranti atau versi browser ini belum menyokong push notification. Kemas kini sistem dan
              browser, kemudian buka semula CasePilot dari Home Screen.
            </p>
          ) : message && status === "error" ? (
            <p className="rounded-md border border-red-900 bg-red-950/60 p-4 text-sm leading-6 text-red-100">
              {message}
            </p>
          ) : null}

          <button
            type="button"
            className="primary-button w-full"
            onClick={onEnable}
            disabled={status === "loading" || blocked || unsupported}
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            {status === "loading" ? "Turning on notifications" : "Allow notifications"}
          </button>
        </div>
      </section>
    </main>
  );
}
