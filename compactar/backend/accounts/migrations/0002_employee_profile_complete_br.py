from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="person_type",
            field=models.CharField(choices=[("individual", "Pessoa física"), ("company", "Pessoa jurídica")], db_index=True, default="individual", max_length=20),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="document_number",
            field=models.CharField(blank=True, db_index=True, max_length=18, verbose_name="CPF/CNPJ"),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="trade_name",
            field=models.CharField(blank=True, max_length=160, verbose_name="Nome fantasia"),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="state_registration",
            field=models.CharField(blank=True, max_length=40, verbose_name="Inscrição estadual"),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="municipal_registration",
            field=models.CharField(blank=True, max_length=40, verbose_name="Inscrição municipal"),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="birth_date",
            field=models.DateField(blank=True, null=True, verbose_name="Data de nascimento/fundação"),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="phone_e164",
            field=models.CharField(blank=True, max_length=40, verbose_name="WhatsApp / telefone principal"),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="secondary_phone_e164",
            field=models.CharField(blank=True, max_length=40, verbose_name="Telefone secundário"),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="zip_code",
            field=models.CharField(blank=True, max_length=9, verbose_name="CEP"),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="address_line",
            field=models.CharField(blank=True, max_length=180, verbose_name="Endereço"),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="address_number",
            field=models.CharField(blank=True, max_length=20, verbose_name="Número"),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="address_complement",
            field=models.CharField(blank=True, max_length=120, verbose_name="Complemento"),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="district",
            field=models.CharField(blank=True, max_length=120, verbose_name="Bairro"),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="city",
            field=models.CharField(blank=True, max_length=120, verbose_name="Cidade"),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="state",
            field=models.CharField(blank=True, max_length=2, verbose_name="UF"),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="country",
            field=models.CharField(blank=True, default="Brasil", max_length=80, verbose_name="País"),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="custom_data",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterModelOptions(
            name="userprofile",
            options={"ordering": ["user__first_name", "user__last_name", "user__username"], "verbose_name": "Perfil de usuário/funcionário", "verbose_name_plural": "Perfis de usuários/funcionários"},
        ),
    ]
