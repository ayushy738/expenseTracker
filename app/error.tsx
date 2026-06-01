"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <p className="text-xl font-bold">Something went wrong</p>
        <p className="mt-2 text-sm text-muted-foreground">The dashboard hit an unexpected state. Try reloading the view.</p>
        <Button className="mt-5" onClick={reset}>Retry</Button>
      </CardContent>
    </Card>
  );
}
