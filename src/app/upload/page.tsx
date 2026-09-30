import { UploadForm } from "@/components/upload-form";

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload a recording</h1>
        <p className="text-sm text-muted">
          Audio or video up to 50 MB. Hindi, English or both mixed: it&apos;s transcribed as spoken, with Hindi in
          Devanagari and English as English, then made readable in romanized Hinglish and in English.
        </p>
      </div>
      <UploadForm />
    </div>
  );
}
