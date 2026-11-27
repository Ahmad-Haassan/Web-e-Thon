import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { BrandMark, Button, Card, CardContent } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center text-foreground">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 py-8">
          <div className="flex flex-col items-center gap-2">
            <BrandMark className="h-11 w-11" />
            <span className="font-display text-xs font-bold uppercase tracking-[0.12em] text-ink-subtle">
              NIIT EMS · Error 404
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-foreground">
            Page Not Found
          </h1>
          <p className="text-sm text-ink-muted">
            The route you requested does not exist or may have moved. Return to the portal home page or inspect a certificate in the public verifier.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/">
              <Button>
                <ArrowLeft className="h-4 w-4" /> Back to home
              </Button>
            </Link>
            <Link href="/verify">
              <Button variant="secondary">
                <ShieldCheck className="h-4 w-4 text-verified" /> Public verify
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
