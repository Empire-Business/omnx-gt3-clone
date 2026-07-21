# Fix: Create Employee - Handle Existing Email

## Problem

When creating a new employee with an email that's already registered in Supabase Auth, the Edge Function fails with:

```
Error creating auth user: A user with this email address has already been registered
```

## Root Cause

The [`create-employee`](../supabase/functions/create-employee/index.ts) function attempts to create a new auth user without first checking if the email already exists in the system.

## Solution

Modify the Edge Function to:

1. **Check if email exists** before attempting to create a new user
2. **Handle existing users appropriately**:
   - If user exists in the **same tenant**: Return error "Este email já está cadastrado na sua empresa"
   - If user exists in **another tenant**: Return error "Este email já está cadastrado em outra empresa"
3. **Provide clear error messages** in Portuguese for better UX

## Implementation Details

### Changes to `supabase/functions/create-employee/index.ts`

```typescript
// Before creating user, check if email exists
const { data: existingUsers, error: listErr } = await serviceClient.auth.admin.listUsers();

if (listErr) {
  console.log("[create-employee] Error listing users:", listErr.message);
  return json({ error: "Erro ao verificar usuários existentes" }, 500);
}

const existingUser = existingUsers.users.find(
  u => u.email?.toLowerCase() === email.trim().toLowerCase()
);

if (existingUser) {
  // Check if user is already in the same tenant
  const { data: existingProfile } = await serviceClient
    .from("profiles")
    .select("tenant_id")
    .eq("user_id", existingUser.id)
    .single();

  if (existingProfile?.tenant_id === tenantId) {
    return json({ 
      error: "Este email já está cadastrado como colaborador nesta empresa" 
    }, 400);
  } else if (existingProfile) {
    return json({ 
      error: "Este email já está cadastrado em outra empresa. Entre em contato com o administrador." 
    }, 400);
  }
  
  // User exists but has no profile (edge case)
  return json({ 
    error: "Este email já está cadastrado no sistema" 
  }, 400);
}

// Proceed with user creation...
```

## Files to Modify

1. **`supabase/functions/create-employee/index.ts`** - Add email existence check and proper error handling

## Testing

1. Try creating an employee with an email that doesn't exist → Should succeed
2. Try creating an employee with an email from the same tenant → Should show "já cadastrado nesta empresa"
3. Try creating an employee with an email from another tenant → Should show "já cadastrado em outra empresa"