import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: todos, error } = await supabase.from('todos').select();

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h1 className="text-lg font-bold text-slate-800">Supabase Todos Test</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-mono">
            Live Supabase
          </span>
        </div>

        {error && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <p className="font-semibold">Note from Supabase:</p>
            <p className="mt-1 font-mono text-[11px]">{error.message}</p>
            <p className="mt-2 text-slate-600">
              To populate data, create a <code className="font-mono bg-amber-100 px-1 rounded">todos</code> table in your Supabase SQL Editor.
            </p>
          </div>
        )}

        <ul className="divide-y divide-slate-100 text-sm">
          {todos && todos.length > 0 ? (
            todos.map((todo: any) => (
              <li key={todo.id} className="py-2 flex items-center justify-between text-slate-700">
                <span>{todo.name || todo.title || JSON.stringify(todo)}</span>
              </li>
            ))
          ) : (
            <li className="py-4 text-center text-slate-400 text-xs">
              No todos found. Insert a row in the <code className="font-mono">todos</code> table to view it here.
            </li>
          )}
        </ul>

        <div className="pt-2 border-t flex justify-between text-xs text-slate-500">
          <a href="/dashboard" className="text-blue-600 hover:underline">
            &larr; Back to LMS Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
