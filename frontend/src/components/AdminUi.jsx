import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import client from '../api/client'
import AddCandidateWizard from './AddCandidateWizard'
import RoleFormModal from './RoleFormModal'

const Ctx = createContext(null)
export const useAdminUi = () => useContext(Ctx)

/**
 * Hosts the dialogs that can be opened from anywhere in the admin area (Add candidate,
 * New/Edit role) and a `version` counter pages watch to refetch after something was created.
 */
export function AdminUiProvider({ children }) {
  const [version, setVersion] = useState(0)
  const [wizard, setWizard] = useState({ open: false, roleId: null })
  const [roleForm, setRoleForm] = useState({ open: false, role: null })
  const [roles, setRoles] = useState([])
  const bump = useCallback(() => setVersion((v) => v + 1), [])

  const loadRoles = useCallback(() => client.get('/admin/jds').then((r) => setRoles(r.data)).catch(() => {}), [])
  useEffect(() => { loadRoles() }, [loadRoles, version])

  const api = useMemo(() => ({
    version, bump,
    openAddCandidate: (roleId = null) => setWizard({ open: true, roleId }),
    openRoleForm: (role = null) => setRoleForm({ open: true, role }),
  }), [version, bump])

  return (
    <Ctx.Provider value={api}>
      {children}
      <AddCandidateWizard open={wizard.open} roles={roles} presetRoleId={wizard.roleId}
        onClose={() => setWizard({ open: false, roleId: null })} onDone={bump} />
      <RoleFormModal open={roleForm.open} role={roleForm.role}
        onClose={() => setRoleForm({ open: false, role: null })} onSaved={() => bump()} />
    </Ctx.Provider>
  )
}
