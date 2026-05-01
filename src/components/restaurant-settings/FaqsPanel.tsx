import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listFaqs } from "@/lib/queries";
import type { Faq } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function FaqsPanel({ restaurantId }: { restaurantId: string }) {
  const [items, setItems] = useState<Faq[]>([]);
  const [draft, setDraft] = useState({ category: "", question: "", answer: "" });

  useEffect(() => { listFaqs(restaurantId).then(setItems); }, [restaurantId]);

  async function add() {
    if (!draft.question || !draft.answer) return;
    const { data, error } = await supabase
      .from("faqs")
      .insert({ restaurant_id: restaurantId, ...draft, is_active: true })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setItems((p) => [...p, data as Faq]);
    setDraft({ category: "", question: "", answer: "" });
  }

  async function update(id: string, patch: Partial<Faq>) {
    setItems((p) => p.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    await supabase.from("faqs").update(patch).eq("id", id);
  }

  async function remove(id: string) {
    await supabase.from("faqs").delete().eq("id", id);
    setItems((p) => p.filter((f) => f.id !== id));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 grid md:grid-cols-3 gap-3">
          <div><Label>Categoría</Label><Input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Pregunta</Label><Input value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} /></div>
          <div className="md:col-span-3"><Label>Respuesta</Label><Textarea value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} /></div>
          <div className="md:col-span-3 flex justify-end"><Button onClick={add}><Plus className="h-4 w-4 mr-1" />Añadir FAQ</Button></div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {items.map((f) => (
          <Card key={f.id}>
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{f.category || "Sin categoría"}</p>
                  <p className="font-medium">{f.question}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={f.is_active} onCheckedChange={(c) => update(f.id, { is_active: c })} />
                  <Button size="icon" variant="ghost" onClick={() => remove(f.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{f.answer}</p>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay FAQs.</p>}
      </div>
    </div>
  );
}