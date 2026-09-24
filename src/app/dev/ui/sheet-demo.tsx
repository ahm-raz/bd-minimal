"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FormField } from "@/components/common/form-field";

export function SheetDemo() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const error = name.length > 0 && name.trim().length < 2 ? "Company name needs at least 2 characters." : null;

  return (
    <>
      <Button onClick={() => setOpen(true)}>New lead</Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader className="border-b border-line">
            <SheetTitle>New lead</SheetTitle>
            <SheetDescription>Side panel, 560px, slides in from the right.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <FormField label="Company name" htmlFor="sheet-company" required error={error}>
              <Input
                id="sheet-company"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!error}
              />
            </FormField>
          </div>
          <SheetFooter className="flex-row justify-end border-t border-line">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                toast.success("Lead saved");
              }}
            >
              Save lead
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
