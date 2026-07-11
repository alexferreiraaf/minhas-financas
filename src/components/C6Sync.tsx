import React, { useState, useMemo, useEffect } from 'react';
import { parsePdfToTransactions, ParsedTransaction } from '@/lib/pdf-parser';
import { useFirebase, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, writeBatch, doc } from 'firebase/firestore';
import { useCollection } from '@/firebase';
import { format, parseISO, startOfDay, addDays, subDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from "@/hooks/use-toast";
import { Loader, AlertTriangle, CheckSquare, X, Trash2 } from 'lucide-react';
import { Transaction } from '@/lib/types';

export default function C6Sync({ onClose }: { onClose: () => void }) {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const transactionsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'users', user.uid, 'transactions'));
  }, [firestore, user]);

  const { data: dbTransactions, isLoading } = useCollection<Transaction>(transactionsQuery);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [bankName, setBankName] = useState('Meu Banco');

  const [extractedTransactions, setExtractedTransactions] = useState<ParsedTransaction[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);

  const missingTransactions = useMemo(() => {
    if (!dbTransactions) return [];
    
    return extractedTransactions.filter(c6Tx => {
      // Find a matching transaction in DB
      // We check if there's any transaction with the exact same value, and a date within 2 days (to account for "data contábil").
      const c6Date = startOfDay(parseISO(c6Tx.date));
      const c6DatePlus1 = addDays(c6Date, 1);
      const c6DatePlus2 = addDays(c6Date, 2);
      const c6DateMinus1 = subDays(c6Date, 1);
      const c6DateMinus2 = subDays(c6Date, 2);
      
      const allowedDates = [
        c6Date.getTime(),
        c6DatePlus1.getTime(),
        c6DatePlus2.getTime(),
        c6DateMinus1.getTime(),
        c6DateMinus2.getTime(),
      ];

      const match = dbTransactions.find(dbTx => {
        if (!dbTx.data) return false;
        const dbDate = startOfDay(dbTx.data.toDate()).getTime();
        
        const isSameValue = Math.abs(dbTx.valor - c6Tx.val) < 0.01;
        const isSameType = dbTx.tipo === c6Tx.type;
        const isDateClose = allowedDates.includes(dbDate);
        
        return isSameValue && isSameType && isDateClose;
      });

      return !match;
    });
  }, [dbTransactions]);

  const handleSync = async () => {
    if (!firestore || !user || missingTransactions.length === 0) return;
    setIsSyncing(true);

    try {
      const batch = writeBatch(firestore);
      
      missingTransactions.forEach(tx => {
        const transactionRef = doc(collection(firestore, 'users', user.uid, 'transactions'));
        const dateObj = parseISO(tx.date);
        
        // Compensar o timezone adicionando 12h para cair no dia correto
        dateObj.setHours(12);

        batch.set(transactionRef, {
          userId: user.uid,
          descricao: tx.desc + ` (Importado ${bankName})`,
          valor: tx.val,
          tipo: tx.type,
          data: dateObj,
          status: 'pago',
          isParcela: false,
        });
      });

      await batch.commit();
      
      toast({
        title: "Sucesso!",
        description: `${missingTransactions.length} transações importadas com sucesso.`,
      });
      onClose();
    } catch (e) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao importar transações.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUndoSync = async () => {
    if (!firestore || !user || !dbTransactions) return;
    
    const importedTransactions = dbTransactions.filter(tx => tx.descricao.endsWith(`(Importado ${bankName})`));
    if (importedTransactions.length === 0) {
      toast({ description: "Nenhuma transação importada encontrada." });
      return;
    }

    if (!window.confirm(`Tem certeza que deseja apagar as ${importedTransactions.length} transações importadas do C6 Bank?`)) {
      return;
    }

    setIsUndoing(true);
    try {
      const batch = writeBatch(firestore);
      importedTransactions.forEach(tx => {
        const txRef = doc(firestore, 'users', user.uid, 'transactions', tx.id);
        batch.delete(txRef);
      });
      await batch.commit();
      
      toast({
        title: "Desfeito!",
        description: `${importedTransactions.length} transações importadas foram removidas.`,
      });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro", description: "Falha ao remover transações." });
    } finally {
      setIsUndoing(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader className="animate-spin text-blue-500" /></div>;
  }

  return (
    <Card className="fixed inset-4 z-50 overflow-y-auto shadow-2xl border-2 border-blue-500 bg-background/95 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-background/95 pb-4 border-b">
        <div>
          <CardTitle className="text-2xl text-blue-500 flex items-center gap-2">
            <AlertTriangle /> Sincronização {bankName}
          </CardTitle>
          <CardDescription>
            Comparamos o seu extrato do {bankName} com os lançamentos no aplicativo.
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}><X /></Button>
      </CardHeader>
      
      <CardContent className="pt-6">
        <div className="mb-6 bg-muted/50 p-4 rounded-xl border">
          <label className="text-sm font-semibold mb-2 block text-foreground">
            Nome do Banco
          </label>
          <Input 
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="Ex: Nubank, Itaú, C6..."
            className="bg-background max-w-sm"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Esse nome será usado para identificar de onde vieram esses lançamentos (ex: Importado {bankName}).
          </p>
        </div>

        <div className="mb-6 bg-muted/50 p-4 rounded-xl border">
          <label className="text-sm font-semibold mb-2 block text-foreground">
            Extrato em PDF
          </label>
          <Input 
            type="file" 
            accept="application/pdf"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setIsExtracting(true);
              try {
                const txs = await parsePdfToTransactions(file);
                setExtractedTransactions(txs);
                if (txs.length === 0) {
                  toast({ variant: "destructive", title: "Ops", description: "Nenhuma transação encontrada no PDF." });
                } else {
                  toast({ title: "Sucesso", description: `${txs.length} transações encontradas!` });
                }
              } catch(err) {
                console.error(err);
                toast({ variant: "destructive", title: "Erro", description: "Falha ao ler o PDF." });
              } finally {
                setIsExtracting(false);
              }
            }}
            className="bg-background max-w-sm"
          />
          {isExtracting && <p className="text-sm text-blue-500 mt-2 flex items-center"><Loader className="animate-spin mr-2" size={16}/> Lendo extrato...</p>}
        </div>
        
        {extractedTransactions.length > 0 && (
          <>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl">
                <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                  <CheckSquare className="text-green-500" /> Já Sincronizados
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Encontramos {extractedTransactions.length - missingTransactions.length} transações do extrato que já constam no app.
                </p>
                {extractedTransactions.length - missingTransactions.length > 0 && (
                  <Button onClick={handleUndoSync} disabled={isUndoing} variant="destructive" size="sm" className="w-full">
                    {isUndoing ? <Loader className="animate-spin mr-2" size={16} /> : <Trash2 className="w-4 h-4 mr-2" />}
                    Desfazer Importação
                  </Button>
                )}
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 border p-4 rounded-xl">
                <h3 className="font-bold text-lg text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-2">
                  <AlertTriangle className="text-blue-500" /> Faltando no App
                </h3>
                <p className="text-sm text-blue-600 dark:text-blue-400 mb-4">
                  Foram identificadas {missingTransactions.length} transações que não estão no app.
                </p>
                {missingTransactions.length > 0 && (
                  <Button onClick={handleSync} disabled={isSyncing} className="w-full bg-blue-600 hover:bg-blue-700">
                    {isSyncing ? <Loader className="animate-spin mr-2" size={16} /> : null}
                    Importar {missingTransactions.length} Transações Automaticamente
                  </Button>
                )}
              </div>
            </div>

            {missingTransactions.length > 0 && (
              <div className="mt-8">
                <h4 className="font-bold mb-4">Pré-visualização das transações a serem importadas:</h4>
                <div className="space-y-2">
                  {missingTransactions.map((tx, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-muted rounded border text-sm">
                      <div>
                        <span className="text-muted-foreground font-mono mr-3">{format(parseISO(tx.date), 'dd/MM/yyyy')}</span>
                        <span className="font-medium">{tx.desc}</span>
                      </div>
                      <div className={tx.type === 'receita' ? 'text-green-600' : 'text-red-600'}>
                        {tx.type === 'receita' ? '+' : '-'} R$ {tx.val.toFixed(2).replace('.', ',')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
