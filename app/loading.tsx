import { Card, CardContent } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="grid gap-4">
      <div className="h-10 w-2/3 animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-5 h-7 w-28 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
