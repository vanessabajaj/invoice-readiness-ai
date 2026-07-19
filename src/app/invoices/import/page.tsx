import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ImportClient } from "./import-client";

export default async function ImportInvoicesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="flex w-full max-w-4xl flex-col gap-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Import invoices
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Upload a CSV or XLSX file, preview the rows, and map columns to
            invoice fields.
          </p>
        </header>
        <ImportClient />
      </div>
    </main>
  );
}
