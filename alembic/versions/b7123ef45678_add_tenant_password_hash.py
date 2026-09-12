"""add tenant password_hash and index on contact_email

Revision ID: b7123ef45678
Revises: ad88ab7ed361
Create Date: 2026-09-13 00:27:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7123ef45678'
down_revision: Union[str, Sequence[str], None] = 'ad88ab7ed361'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('password_hash', sa.String(length=256), nullable=True))
    op.create_index(op.f('ix_tenants_contact_email'), 'tenants', ['contact_email'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_tenants_contact_email'), table_name='tenants')
    op.drop_column('tenants', 'password_hash')
