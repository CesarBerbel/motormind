# Generated for complete Brazilian customer registration.
from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ("messaging", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="contact",
            name="address_complement",
            field=models.CharField(blank=True, max_length=120, verbose_name="Complemento"),
        ),
        migrations.AddField(
            model_name="contact",
            name="address_line",
            field=models.CharField(blank=True, max_length=180, verbose_name="Endereço"),
        ),
        migrations.AddField(
            model_name="contact",
            name="address_number",
            field=models.CharField(blank=True, max_length=20, verbose_name="Número"),
        ),
        migrations.AddField(
            model_name="contact",
            name="birth_date",
            field=models.DateField(blank=True, null=True, verbose_name="Data de nascimento/fundação"),
        ),
        migrations.AddField(
            model_name="contact",
            name="city",
            field=models.CharField(blank=True, max_length=120, verbose_name="Cidade"),
        ),
        migrations.AddField(
            model_name="contact",
            name="country",
            field=models.CharField(blank=True, default="Brasil", max_length=80, verbose_name="País"),
        ),
        migrations.AddField(
            model_name="contact",
            name="district",
            field=models.CharField(blank=True, max_length=120, verbose_name="Bairro"),
        ),
        migrations.AddField(
            model_name="contact",
            name="document_number",
            field=models.CharField(blank=True, db_index=True, max_length=18, verbose_name="CPF/CNPJ"),
        ),
        migrations.AddField(
            model_name="contact",
            name="municipal_registration",
            field=models.CharField(blank=True, max_length=40, verbose_name="Inscrição municipal"),
        ),
        migrations.AddField(
            model_name="contact",
            name="notes",
            field=models.TextField(blank=True, verbose_name="Observações"),
        ),
        migrations.AddField(
            model_name="contact",
            name="person_type",
            field=models.CharField(choices=[("individual", "Pessoa física"), ("company", "Pessoa jurídica")], db_index=True, default="individual", max_length=20),
        ),
        migrations.AddField(
            model_name="contact",
            name="secondary_phone_e164",
            field=models.CharField(blank=True, max_length=20, validators=[django.core.validators.RegexValidator(message="Use formato E.164. Exemplo Brasil: +5511999999999", regex="^\\+[1-9]\\d{7,14}$")], verbose_name="Telefone secundário"),
        ),
        migrations.AddField(
            model_name="contact",
            name="state",
            field=models.CharField(blank=True, max_length=2, verbose_name="UF"),
        ),
        migrations.AddField(
            model_name="contact",
            name="state_registration",
            field=models.CharField(blank=True, max_length=40, verbose_name="Inscrição estadual"),
        ),
        migrations.AddField(
            model_name="contact",
            name="trade_name",
            field=models.CharField(blank=True, max_length=160, verbose_name="Nome fantasia"),
        ),
        migrations.AddField(
            model_name="contact",
            name="zip_code",
            field=models.CharField(blank=True, max_length=9, verbose_name="CEP"),
        ),
        migrations.AlterField(
            model_name="contact",
            name="first_name",
            field=models.CharField(max_length=120, verbose_name="Nome / Razão social"),
        ),
        migrations.AlterField(
            model_name="contact",
            name="last_name",
            field=models.CharField(blank=True, max_length=120, verbose_name="Sobrenome"),
        ),
        migrations.AlterField(
            model_name="contact",
            name="phone_e164",
            field=models.CharField(blank=True, max_length=20, validators=[django.core.validators.RegexValidator(message="Use formato E.164. Exemplo Brasil: +5511999999999", regex="^\\+[1-9]\\d{7,14}$")], verbose_name="WhatsApp"),
        ),
    ]
