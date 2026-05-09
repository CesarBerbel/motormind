from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.db import transaction

from .roles import ALL_PERMISSION, DASHBOARD_PATHS, ROLE_ADMINISTRATIVE, ROLE_GROUP_NAMES, ROLE_OWNER, ROLE_PERMISSIONS, ROLE_TECHNICIAN

User = get_user_model()


def setup_role_groups():
    groups = {}
    all_app_permissions = Permission.objects.filter(content_type__app_label__in=["messaging", "workshop", "accounts", "finance", "purchasing", "attendance"])
    for role, group_name in ROLE_GROUP_NAMES.items():
        group, _ = Group.objects.get_or_create(name=group_name)
        if role in {ROLE_OWNER, ROLE_ADMINISTRATIVE}:
            group.permissions.set(all_app_permissions)
        else:
            group.permissions.set(_django_permissions_for_role(role))
        groups[role] = group
    return groups


def _django_permissions_for_role(role):
    permissions = Permission.objects.none()
    if role == "attendant":
        permissions = Permission.objects.filter(
            content_type__app_label__in=["messaging", "workshop", "attendance", "finance"],
            codename__regex=r"^(view|add|change)_(contact|contactgroup|vehicle|workorder|workorderevent|workordermessage|workorderservice|countersale|countersaleitem|countersalepayment|estimate|estimateserviceitem|estimatepartitem|accountreceivable)$",
        )
    elif role == "stock":
        permissions = Permission.objects.filter(
            content_type__app_label__in=["workshop", "purchasing"],
            codename__regex=r"^(view|add|change)_(part|partstockmovement|generalcategory|workorderpart|purchaseorder|purchaseorderitem|supplier)$",
        )
    elif role == "technician":
        permissions = Permission.objects.filter(
            content_type__app_label="workshop",
            codename__regex=r"^(view|change)_(workorder|workorderservice)$",
        )
    elif role == "finance":
        permissions = Permission.objects.filter(
            content_type__app_label__in=["messaging", "workshop", "finance", "purchasing", "attendance"],
            codename__regex=r"^(view|add|change)_(contact|vehicle|workorder|workorderpayment|countersale|countersalepayment|estimate|accountreceivable|accountpayable|accountpayablepayment|purchaseorder|purchaseorderitem|supplier)$",
        )
    return permissions


@transaction.atomic
def apply_role_to_user(user, role, technician_specialty=""):
    setup_role_groups()
    from .models import UserProfile

    profile, _ = UserProfile.objects.get_or_create(user=user)
    if role == ROLE_OWNER:
        user.is_staff = True
        user.is_superuser = True
    else:
        user.is_staff = False
        user.is_superuser = False
    if role != ROLE_TECHNICIAN:
        technician_specialty = ""
    user.save(update_fields=["is_staff", "is_superuser"])
    profile.role = role
    profile.technician_specialty = technician_specialty or ""
    profile.full_clean()
    profile.save(update_fields=["role", "technician_specialty", "updated_at"])
    role_group_names = set(ROLE_GROUP_NAMES.values())
    user.groups.remove(*Group.objects.filter(name__in=role_group_names))
    user.groups.add(Group.objects.get(name=ROLE_GROUP_NAMES[role]))
    user._state.fields_cache.pop("profile", None)
    return user


def get_user_role(user):
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return ROLE_OWNER
    return getattr(getattr(user, "profile", None), "role", None)


def get_user_dashboard_path(user):
    return DASHBOARD_PATHS.get(get_user_role(user), "/login")


def get_permission_codes(user):
    role = get_user_role(user)
    if not role:
        return []
    codes = ROLE_PERMISSIONS.get(role, [])
    return [ALL_PERMISSION] if ALL_PERMISSION in codes else sorted(set(codes))


def user_has_permission(user, required):
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if required in (None, "", "authenticated"):
        return True
    codes = get_permission_codes(user)
    if ALL_PERMISSION in codes:
        return True
    if isinstance(required, (list, tuple, set)):
        return any(user_has_permission(user, code) for code in required)
    return required in codes
