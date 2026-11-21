const hasActiveAccountStatus = (account, seen) => {
  if (!account || typeof account !== 'object') return false;
  if (seen.has(account)) return false;
  seen.add(account);

  const trueValues = [true, 1, 'true', '1', 'yes'];
  const activationFlags = [
    account.enabled,
    account.isEnabled,
    account.accountEnabled,
    account.active,
    account.isActive,
    account.activated,
    account.isActivated,
    account.passwordSet,
    account.passwordConfigured,
  ];

  if (activationFlags.some((value) =>
    trueValues.includes(typeof value === 'string' ? value.trim().toLowerCase() : value)
  )) {
    return true;
  }

  const username = account.username ?? account.userName ?? account.user_name;
  if (typeof username === 'string' && username.trim()) {
    return true;
  }

  const statuses = [account.status, account.accountStatus, account.registrationStatus]
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim().toLowerCase());

  if (statuses.some((status) =>
    ['active', 'activated', 'verified', 'complete', 'completed'].includes(status)
  )) {
    return true;
  }

  const nestedAccounts = [
    account.user,
    account.userReg,
    account.userAccount,
    account.account,
    account.accountInfo,
    account.userDetails,
    account.credentials,
  ];
  return nestedAccounts.some((nested) => hasActiveAccountStatus(nested, seen));
};

export const isAccountActive = (account) =>
  hasActiveAccountStatus(account, new Set());
